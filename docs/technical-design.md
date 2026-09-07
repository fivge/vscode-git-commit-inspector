# Git Commit Inspector 技术设计

本文记录 Git Commit Inspector 当前实现的架构、关键设计决策、边界条件和验证方式。面向扩展用户的安装与使用说明请参阅[项目 README](../README.md)。

## 1. 目标与边界

扩展只解决一条核心链路：

```text
Terminal 中的 Git SHA
        ↓
定位 Repository 并解析 Commit
        ↓
在 Sidebar 展示 Files Changed 和 Commit 信息
        ↓
使用 VS Code 原生 Diff 查看文件变化
```

设计原则：

- Terminal first：终端是主要入口，同时保留命令面板入口。
- Commit focused：围绕单个 commit 展示信息，不提供完整 Git 客户端功能。
- Native UI：使用 TreeView 和原生 Diff Editor，不引入 WebView。
- Local only：通过 VS Code 内置 Git 扩展读取本地仓库，不依赖网络服务。
- Lazy queries：只有用户点击 SHA、刷新或打开文件时才访问 Git。
- Small surface：运行时依赖为零，模块按职责拆分。

不在当前范围内的能力包括 Git Graph、历史浏览、Blame、分支与标签管理、提交与推送、远程平台集成以及自定义 Diff 渲染。

## 2. 运行时架构

`src/extension.ts` 是组合入口，只负责创建对象并注册 VS Code 能力：

```text
activate
├── TerminalLinkProvider
├── CommitInspectController
│   ├── RepositoryResolver
│   ├── GitService
│   ├── ChangeTreeProvider
│   └── CommitTreeProvider
├── RevisionContentProvider
└── DiffController
```

主要模块：

| 模块 | 职责 |
| --- | --- |
| `terminal/` | 从终端文本中识别 SHA，并在点击后发起检查。 |
| `git/` | 定义领域类型，封装 VS Code Git API，解析 commit 所属仓库。 |
| `commit/` | 编排检查、刷新、清空和并发状态。 |
| `views/` | 构建文件树并提供 Files Changed、Commit 两个 TreeView。 |
| `diff/` | 计算 Diff 两侧、编码虚拟 URI、读取历史文件内容并打开原生 Diff。 |

扩展通过 `onStartupFinished` 激活。激活过程只注册 provider、view 和 command，不扫描 Git 历史，也不轮询仓库。

## 3. Terminal SHA 识别

`CommitLinkProvider` 使用 `scanCommitHashes()` 扫描 VS Code 传入的单行终端文本。默认接受 7–40 位十六进制字符串，最小长度可配置为 4–40。

匹配阶段只做字符串扫描，不访问 Git：

```text
Terminal output → hashScanner → TerminalLink
```

用户点击链接后，provider 才把 SHA 和终端当前目录交给 `CommitInspectController`。这种分离避免终端持续输出时产生 Git 查询。

十六进制文本不一定是真实 SHA。扩展允许它先成为链接，再在点击后通过 Git 验证。无效 ref 会得到明确错误，不会改变当前视图内容。

## 4. Repository 解析

终端文本只有 ref，没有仓库信息。`RepositoryResolver` 按以下顺序定位仓库：

1. 读取 VS Code 内置 Git 扩展已经发现的 repositories。
2. 如果 Shell Integration 提供终端当前目录，优先检查该目录所属仓库。
3. 如果优先仓库不能解析 ref，再并行检查工作区中的其他仓库。
4. 一个仓库命中时直接使用；多个仓库命中时显示 Quick Pick；没有命中时报告错误。

该策略支持 multi-root workspace、monorepo、嵌套仓库、worktree、Remote SSH、WSL 和 Dev Container。仓库访问始终经由 URI 与 VS Code Git API 完成，不假设本地文件系统路径可直接访问。

## 5. Git 抽象与数据模型

UI 和控制器只依赖 `GitService`，不会直接调用 VS Code 内置 Git 扩展的非核心 API：

```ts
interface GitService {
  getRepositories(): Promise<readonly RepositoryRef[]>;
  getRepositoryForUri(uri: Uri): Promise<RepositoryRef | undefined>;
  resolveCommit(repository: RepositoryRef, ref: string): Promise<CommitInfo>;
  getCommitChanges(
    repository: RepositoryRef,
    commit: CommitInfo,
  ): Promise<readonly CommitChange[]>;
  getFileAtRevision(
    repository: RepositoryRef,
    ref: string,
    filePath: string,
  ): Promise<string>;
  isBinaryFile(
    repository: RepositoryRef,
    ref: string,
    filePath: string,
  ): Promise<boolean>;
}
```

`VsCodeGitService` 是当前唯一实现。它激活 `vscode.git`、等待 API 初始化，并把内部 Git 类型转换为扩展自己的稳定模型。

文件变化统一表示为：

```ts
interface CommitChange {
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}
```

所有路径都转换为仓库根目录下的 POSIX 风格相对路径，保证构建文件树和 Revision URI 时行为一致。

## 6. Commit changes 语义

普通提交使用第一个 parent 与当前 commit 比较：

```text
parent[0] → commit
```

合并提交也采用 first-parent 语义。当前 UI 不提供切换其他 parent 的选项。

根提交没有 parent。Git 层使用 SHA-1 empty tree `4b825dc...` 作为比较基准，因此根提交中的文件会被识别为新增文件。

`createDiffSpec()` 根据变化类型确定 Diff 两侧：

| 状态 | 左侧 | 右侧 |
| --- | --- | --- |
| Modified / Unknown | `parent:path` | `commit:path` |
| Added | 空文档 | `commit:path` |
| Deleted | `parent:path` | 空文档 |
| Renamed / Copied | `parent:oldPath` | `commit:path` |

## 7. Revision URI 与原生 Diff

历史版本文件不一定存在于工作区磁盘中。扩展注册 `git-commit-inspect` 文本文档 provider，用虚拟 URI 表达仓库、ref 和文件路径。

URI 的可读路径部分保留文件路径，以便 VS Code 识别语言和文件名；仓库 ID、ref 或空文档标记编码在 Base64URL query payload 中：

```text
git-commit-inspect://revision/src/example.ts?data=<payload>
```

`RevisionContentProvider` 解码 URI，重新找到已打开的仓库，并通过 `GitService.getFileAtRevision()` 读取内容。Added 和 Deleted 使用同一 scheme 表示空文档，不创建临时文件。

`DiffController` 最终调用：

```ts
vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
```

语法高亮、并排或内联布局、导航和编辑器行为全部交给 VS Code。

打开 Diff 前会检查两侧对象类型。检测到二进制内容时显示提示，不把二进制数据传给文本内容 provider。

## 8. TreeView

扩展贡献同一个 Activity Bar container 下的两个 view：

- **Files Changed**：按路径生成目录树，显示状态与增删行数。
- **Commit**：分别显示短 SHA、消息、作者和时间。

### Files Changed

`buildChangeTree()` 把扁平的 `CommitChange[]` 转换成目录节点和文件节点。每层都按“目录优先、名称排序”的规则稳定排序。

文件和目录节点设置 `resourceUri`，并分别使用 `ThemeIcon.File` 与 `ThemeIcon.Folder`，让 VS Code 从用户当前的文件图标主题中选择图标。文件描述保留 Git 状态和行数，点击后交给 `DiffController`。

刷新成功后，provider 从父目录到子目录逐个调用 `TreeView.reveal()`，从而展开任意深度的目录。VS Code 单次 `reveal` 最多递归三层，因此不能只对根节点调用一次。

provider 为每个节点建立父节点索引并实现 `getParent()`，这是 `reveal()` 正确工作的前提。每次替换或清空 inspection 都会递增 generation，使正在执行的旧展开任务及时停止。

### Commit

Commit ID 与消息使用独立行。消息行显示 subject，完整多行消息放在 Markdown tooltip 中。SHA、消息、作者和时间节点共用右键复制命令，复制值分别为完整 SHA、完整消息、格式化作者和格式化时间。

TreeView 单行项目不能自动换行，因此 tooltip 是展示完整 commit body 的主要入口。

## 9. 状态与并发

`CommitInspectController` 保存当前 `Inspection`，其中包含 repository、commit 和 changes。成功检查后，它同时更新两个 TreeDataProvider，并设置 `gitCommitInspect.hasCommit` context key。

用户可能连续点击多个 SHA。`LatestRequest` 为每次检查生成递增标识，只有最后一次请求可以提交结果：

```text
click A → request 1 ─┐
click B → request 2 ─┼→ only request 3 updates UI
click C → request 3 ─┘
```

Clear 会使当前请求失效并清空视图。Refresh 重新解析当前完整 SHA、读取变化并更新视图；刷新期间如果发生更新请求，旧结果同样不会覆盖新状态。

## 10. 错误处理

Git 和 repository 层将预期失败转换成 `InspectorError`，控制器向用户显示面向操作的消息。主要情况包括：

- 工作区中没有已打开的 Git repository。
- ref 在所有候选仓库中都无法解析。
- VS Code 内置 Git 扩展不存在或被禁用。
- repository 在打开 Diff 前已关闭。
- 无法读取指定 revision 的文件。
- 文件是二进制内容，无法打开文本 Diff。

用户取消多仓库 Quick Pick 使用独立的 `InspectionCancelledError`，不会显示错误提示。

## 11. 配置与 Contributions

当前配置保持精简：

```json
{
  "gitCommitInspect.terminalLinks.enabled": true,
  "gitCommitInspect.terminalLinks.minHashLength": 7
}
```

主要 command：

| Command | 用途 |
| --- | --- |
| `gitCommitInspect.inspectCommit` | 输入 ref 并检查 commit。 |
| `gitCommitInspect.refresh` | 刷新当前 commit 和文件树。 |
| `gitCommitInspect.clear` | 清空当前 inspection。 |
| `gitCommitInspect.openDiff` | 打开某个 change 的 Diff。 |
| `gitCommitInspect.copyCommitValue` | 复制 Commit view 的节点值。 |

## 12. 性能约束

- 激活时只注册功能，不查询 repository 和 commit。
- 终端每行只执行边界检查和十六进制匹配。
- Git 查询由用户检查 commit、刷新或打开 Diff 触发。
- 文件树只保存当前 inspection，不维护历史数据库。
- 扩展没有运行时 npm 依赖，不创建 WebView 或后台进程。

## 13. 测试与验证

单元测试覆盖不依赖 VS Code UI 的核心逻辑：

- SHA 边界、最小长度配置和误匹配。
- repository 优先级与多仓库匹配。
- 最新请求覆盖和 Clear 失效。
- 文件树构建、排序与 rename 元数据。
- Added、Deleted、Renamed、Root 和 Merge first-parent 的 Diff 规则。

集成测试会下载 VS Code 测试宿主，创建临时 Git repository，并验证：

- 扩展激活和命令入口。
- commit 解析及变化类型。
- Revision URI 编解码和历史内容读取。
- root、merge、rename、binary 等 Git 场景。
- 文件图标资源 URI、父节点索引、深层展开和过期任务取消。

本地验证命令：

```bash
bun install
bun run check
bun run lint
bun test
bun run build
bun run test:integration
```

`test:integration` 首次运行需要联网下载 VS Code 测试宿主。

## 14. 维护原则

- 新功能应继续围绕 Terminal → Commit → Files → Diff 主链路。
- Git API 变化集中在 `git/` 内适配，不向 UI 层扩散。
- Diff 语义保持为纯函数并优先通过单元测试验证。
- 原生 VS Code 组件能够满足需求时，不增加 WebView 或自定义渲染器。
- 新增后台扫描、缓存或依赖前，需要有明确的性能问题和可衡量收益。
