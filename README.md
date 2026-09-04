# VS Code Terminal Git Commit Inspector 技术方案

> 当前状态：完整 MVP 已实现。扩展会识别 Integrated Terminal 中的 Git SHA，点击后在原生 Sidebar 中展示 commit 与文件树，并用 VS Code Diff Editor 打开文件变更。

## 开发与运行

```bash
bun install
bun run check
bun run lint
bun test
bun run build
```

在 VS Code 中打开本仓库，运行 `Run Extension` 调试配置；在 Extension Development Host 的 Git workspace 中执行 `git log --oneline`，然后 Ctrl/Cmd + Click commit SHA。

可用命令：

```text
Git Commit Inspector: Inspect Commit...
Git Commit Inspector: Refresh
Git Commit Inspector: Copy Commit Hash
Git Commit Inspector: Clear
```

集成测试会下载当前稳定版 VS Code 并创建临时 Git fixture：

```bash
bun run test:integration
```

## 1. 项目背景

日常在 VS Code Integrated Terminal 中使用 Git 时，经常通过：

```bash
git log --oneline
git log --graph --oneline
git show
git reflog
git cherry
```

得到类似输出：

```text
47db09b feat: RT-4750 Flex row container & inline SpecWidget padding
0f89466 fix: form elements
ba98ca1 refactor: widget registry
```

当前希望获得类似 GitLens 的交互：

```text
Terminal 中出现 Commit SHA
        ↓
Ctrl / Cmd + Click
        ↓
识别对应 Git Repository 和 Commit
        ↓
左侧 Sidebar 展示 Commit 信息和 Files Changed
        ↓
点击具体文件
        ↓
使用 VS Code 原生 Diff Editor 查看该文件在此 Commit 中的变化
```

GitLens 已经能提供类似能力，但其功能范围远超实际需求，包括：

* Blame
* Graph
* History
* Branches
* Tags
* Stashes
* Remote integrations
* GitHub / PR
* Search
* CodeLens
* AI 等

本项目不希望重新实现完整 Git 工具，而是提供一个**功能单一、启动成本低、依赖少、原生 VS Code UI 为主**的微型扩展。

---

# 2. 核心目标

插件只解决一个主要场景：

> **在 VS Code Terminal 中点击 Git Commit SHA，然后快速检查该 Commit 修改了哪些文件，并通过 VS Code 原生 Diff 查看具体修改。**

目标体验：

```text
Terminal
──────────────────────────────────
$ git log --oneline

47db09b feat: RT-4750 Flex row...
^^^^^^^^
Cmd + Click

                  ↓

Sidebar
──────────────────────────────────
COMMIT

47db09b
feat: RT-4750 Flex row container...
Author: xxx
Date: ...

FILES CHANGED 6

▼ src
  ▼ components
    ▼ widgetFrame
      ▼ demo
        M mockData.ts          +7 -3

      ▼ widgets
        M SpecWidget.tsx      +11 -4
        M SpecWidgetEntry.tsx  +1 -1
        M catalog.ts           +5 -0
        M registry.ts         +10 -0

M README.md                  +3 -2


点击 mockData.ts
                  ↓

VS Code Native Diff Editor

parent:mockData.ts │ commit:mockData.ts
──────────────────┼────────────────────
- old line        │ + new line
```

UI 可以参考 GitLens Inspect，但**不复制其复杂功能体系**。

---

# 3. 产品定位

暂定项目定位：

> **Minimal Git Commit Inspector for VS Code**

核心原则：

1. Terminal first
2. Commit focused
3. Native VS Code UI
4. Local Git only
5. Zero network dependency
6. No WebView unless未来确有必要
7. 不构建完整 Git 管理工具
8. 点击时执行 Git 查询，而不是持续后台扫描

---

# 4. MVP 功能范围

## 4.1 Terminal Commit SHA 自动链接

识别 VS Code Integrated Terminal 中的 Git commit hash。

例如：

```text
47db09b
47db09b1
47db09b1bd321e...
```

通过 VS Code：

```ts
vscode.window.registerTerminalLinkProvider(...)
```

注册 Terminal Link。

效果：

```text
47db09b
^^^^^^^^
Ctrl/Cmd + Click
```

点击后触发：

```ts
inspectCommit("47db09b")
```

### Terminal Provider 性能要求

`provideTerminalLinks()` 只进行：

```text
字符串扫描
+
正则匹配
```

**禁止在这里调用 Git。**

不要：

```ts
provideTerminalLinks() {
  // ❌ 每输出一行 terminal 都跑 git
  await repository.getCommit(hash);
}
```

应该：

```text
Terminal output
     ↓
Regex
     ↓
TerminalLink
```

真正点击以后才验证：

```text
handleTerminalLink
     ↓
resolveRepository
     ↓
getCommit
```

默认可考虑：

```regex
(?<![0-9a-fA-F])[0-9a-fA-F]{7,40}(?![0-9a-fA-F])
```

后续可支持 SHA-256 Git object ID。

---

# 5. Repository 解析

这是核心逻辑之一。

Terminal 中：

```text
47db09b
```

本身没有 Repository 信息。

插件需要确定 SHA 属于哪个 Repository。

## 推荐策略

### 第一优先级：Terminal CWD

如果 VS Code Shell Integration 能提供当前 terminal cwd：

```text
Terminal cwd
     ↓
查找 cwd 所属 repository
     ↓
repository.getCommit(hash)
```

这是最快路径。

### 第二优先级：Workspace repositories

通过 VS Code 内置 Git Extension 获取：

```ts
const gitExtension =
  vscode.extensions.getExtension<GitExtension>("vscode.git");

const git = gitExtension.exports.getAPI(1);

git.repositories;
```

然后寻找能够解析该 SHA 的 repository：

```text
47db09b

        ↓

frontend   → getCommit → fail
backend    → getCommit → success
docs       → getCommit → fail

        ↓

backend repository
```

建议：

1. cwd 对应 repo 优先；
2. 再检查其他 workspace repositories；
3. 一个命中 → 直接使用；
4. 多个命中 → QuickPick；
5. 没有命中 → 提示 commit 无法解析。

这样可以较好处理：

* multi-root workspace
* monorepo
* nested repository
* WSL
* Remote SSH
* Dev Container
* worktree
* 多 Terminal

---

# 6. Git 层设计

不要让 UI 层直接调用 Git。

定义统一接口：

```ts
interface GitService {
  resolveCommit(
    repository: RepositoryRef,
    ref: string
  ): Promise<CommitInfo>;

  getCommitChanges(
    repository: RepositoryRef,
    commit: CommitInfo
  ): Promise<CommitChange[]>;

  getFileAtRevision(
    repository: RepositoryRef,
    ref: string,
    path: string
  ): Promise<string | Uint8Array>;
}
```

数据模型：

```ts
interface CommitInfo {
  hash: string;
  shortHash: string;

  message: string;

  authorName?: string;
  authorEmail?: string;

  authorDate?: Date;
  commitDate?: Date;

  parents: string[];
}
```

文件变化：

```ts
type ChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unknown";

interface CommitChange {
  status: ChangeStatus;

  path: string;

  oldPath?: string;

  additions?: number;
  deletions?: number;
}
```

---

# 7. Git 实现策略

第一版优先使用 VS Code 内置：

```text
vscode.git
```

提供的 Repository API。

主要能力：

```ts
repository.getCommit(ref)

repository.diffBetween(...)

repository.diffBetweenWithStats(...)

repository.show(ref, path)

repository.buffer(ref, path)
```

架构上不要让这些 API 泄漏到其他模块。

实现：

```text
GitService
   │
   └── VsCodeGitService
```

原因是 `vscode.git` 属于 VS Code 内置 Git Extension API，而不是普通 `vscode.d.ts` 中最核心的稳定 API。

因此未来可以增加：

```text
GitService
├── VsCodeGitService
└── CliGitService
```

CLI fallback 可以调用：

```bash
git rev-parse
git show
git diff-tree
git diff --numstat
git cat-file
```

但 **MVP 不需要同时实现两个 backend**。

第一版：

> 优先 `VsCodeGitService`，接口设计好即可。

---

# 8. Commit Changes 获取

普通 Commit：

```text
parent
   │
   │ diff
   ▼
commit
```

逻辑：

```ts
const commit = await git.getCommit(hash);

const parent = commit.parents[0];

const changes = await git.diffBetweenWithStats(
  parent,
  commit.hash
);
```

结果例如：

```text
M src/foo.ts          +10 -3
A src/bar.ts           +5
D src/legacy.ts           -15
R src/a.ts → src/b.ts +2 -1
```

---

# 9. Merge Commit

Merge commit 可能：

```text
        B
       /
A ----M
       \
        C
```

存在多个 parent：

```ts
commit.parents = [
  "parent1",
  "parent2"
]
```

MVP 定义：

> **默认与 first parent 比较。**

即：

```text
commit.parents[0]
        ↓
      commit
```

这是最符合常见：

```bash
git show <merge-commit>
```

使用习惯的方案。

未来可以增加：

```text
Compare against:

○ First parent
○ Second parent
○ ...
```

但不要进入 MVP。

---

# 10. Root Commit

Root commit：

```ts
parents.length === 0
```

不存在：

```text
parent → commit
```

此时所有文件都相当于：

```text
empty → commit
```

因此：

```text
Added file
```

Diff 左侧为空。

---

# 11. 左侧 Sidebar

不使用：

```text
React
Vue
HTML
WebView
CSS
iframe
```

MVP 使用原生：

```ts
vscode.TreeDataProvider
```

创建自定义 View Container，例如：

```text
Commit Inspect
```

Sidebar：

```text
COMMIT INSPECT

47db09b
feat: RT-4750 Flex row container

FILES CHANGED 6

▼ src
  ▼ components
    ▼ widgetFrame
      ▼ demo
        M mockData.ts         +7 -3
      ▼ widgets
        M SpecWidget.tsx     +11 -4
        M registry.ts        +10 -0

M README.md                  +3 -2
```

---

# 12. Tree 数据结构

内部不要直接把 `CommitChange[]` 当 Tree。

转换为：

```ts
type TreeNode =
  | DirectoryNode
  | FileChangeNode;

interface DirectoryNode {
  type: "directory";

  name: string;
  path: string;

  children: TreeNode[];
}

interface FileChangeNode {
  type: "file";

  name: string;
  path: string;

  change: CommitChange;
}
```

例如：

```text
src/components/widgetFrame/demo/mockData.ts
```

转换：

```text
src
└── components
    └── widgetFrame
        └── demo
            └── mockData.ts
```

---

# 13. 文件显示

建议：

```text
M mockData.ts       +7 -3
A foo.ts           +10
D legacy.ts            -20
R old.ts → new.ts  +2 -1
```

对应：

```text
M Modified
A Added
D Deleted
R Renamed
C Copied
```

可以使用：

```ts
TreeItem.label
TreeItem.description
TreeItem.iconPath
TreeItem.tooltip
```

例如：

```ts
item.label = "mockData.ts";

item.description = "+7 -3";

item.tooltip =
  "Modified\nsrc/components/.../mockData.ts";
```

---

# 14. 点击文件打开 Diff

这是第二个核心能力。

不要自己写 Diff Viewer。

统一调用：

```ts
vscode.commands.executeCommand(
  "vscode.diff",
  leftUri,
  rightUri,
  title
);
```

让 VS Code 自己完成：

* side-by-side
* inline diff
* syntax highlighting
* minimap
* code folding
* navigation
* editor behavior

---

# 15. Revision URI

因为：

```text
commit:path
```

不是磁盘上的真实文件，因此需要定义自有 URI scheme。

例如：

```text
git-commit-inspect:
```

URI 可以表达：

```text
repository
ref
path
```

概念：

```text
git-commit-inspect://repo-id/47db09b/src/foo.ts
```

注册：

```ts
vscode.workspace.registerTextDocumentContentProvider(
  "git-commit-inspect",
  revisionProvider
);
```

实现：

```ts
class RevisionContentProvider
  implements vscode.TextDocumentContentProvider {

  async provideTextDocumentContent(uri: vscode.Uri) {
    const {
      repository,
      ref,
      path
    } = decodeRevisionUri(uri);

    return gitService.getFileAtRevision(
      repository,
      ref,
      path
    );
  }
}
```

---

# 16. 不同 Change 类型如何 Diff

### Modified

```text
parent:path
     ↓
commit:path
```

### Added

```text
empty
  ↓
commit:path
```

### Deleted

```text
parent:path
  ↓
empty
```

### Renamed

假设：

```text
src/a.ts
   ↓
src/b.ts
```

则：

```text
parent:src/a.ts
       ↓
commit:src/b.ts
```

### Copied

类似 Rename，但源文件在 parent 中仍存在。

---

# 17. Empty Revision

Added / Deleted 需要空文档。

可以使用：

```text
git-commit-inspect-empty:
```

或者让 RevisionProvider：

```ts
if (revision === EMPTY_REVISION) {
  return "";
}
```

避免创建真实临时文件。

---

# 18. Binary File

MVP 不要求自己实现 binary diff。

检测到 binary：

```text
image.png
archive.zip
font.woff2
```

可以：

```text
Binary file changed
```

点击后：

* 如果 VS Code 可以处理则交给 VS Code；
* 否则显示 InformationMessage。

不要因为 binary support 引入复杂架构。

---

# 19. Inspect Commit 生命周期

完整调用：

```text
Terminal
   │
   │ 47db09b
   │
   │ Cmd+Click
   ▼
TerminalCommitLinkProvider
   │
   ▼
inspectCommit(47db09b)
   │
   ▼
RepositoryResolver
   │
   ├─ terminal cwd
   │
   └─ workspace repositories
   │
   ▼
GitService.getCommit()
   │
   ▼
CommitInfo
   │
   ▼
GitService.getCommitChanges()
   │
   ▼
CommitInspectController
   │
   ├─ set current commit
   │
   └─ update tree
   │
   ▼
CommitChangesTreeProvider.refresh()
   │
   ▼
Focus Commit Inspect Sidebar
```

用户点击文件：

```text
FileChangeNode
       │
       ▼
DiffController
       │
       ├─ build left URI
       ├─ build right URI
       │
       ▼
vscode.diff
```

---

# 20. 推荐代码目录

建议控制结构，不要过度分层：

```text
src/
├── extension.ts
│
├── terminal/
│   └── commitLinkProvider.ts
│
├── git/
│   ├── types.ts
│   ├── gitService.ts
│   ├── vscodeGitService.ts
│   └── repositoryResolver.ts
│
├── commit/
│   └── commitInspectController.ts
│
├── views/
│   ├── commitTreeProvider.ts
│   └── treeBuilder.ts
│
├── diff/
│   ├── diffController.ts
│   ├── revisionUri.ts
│   └── revisionContentProvider.ts
│
└── utils/
    └── disposable.ts
```

不要为了“Clean Architecture”拆成几十个文件。

目标仍然是：

> Micro Extension。

---

# 21. extension.ts

这里只负责组装依赖：

```ts
export async function activate(
  context: vscode.ExtensionContext
) {
  const gitService = new VsCodeGitService();

  const repositoryResolver =
    new RepositoryResolver(gitService);

  const revisionProvider =
    new RevisionContentProvider(gitService);

  const treeProvider =
    new CommitTreeProvider();

  const diffController =
    new DiffController(gitService);

  const inspectController =
    new CommitInspectController(
      gitService,
      repositoryResolver,
      treeProvider
    );

  // register TreeView
  // register content provider
  // register terminal link provider
  // register commands
}
```

`extension.ts` 不写 Git parser 和 UI 业务逻辑。

---

# 22. package.json Contributions

建议 MVP：

```text
viewsContainers
views
commands
configuration
```

### View Container

例如：

```json
{
  "id": "gitCommitInspect",
  "title": "Commit Inspect"
}
```

### View

```text
gitCommitInspect.files
```

### Commands

第一版仅：

```text
gitCommitInspect.inspectCommit
gitCommitInspect.refresh
gitCommitInspect.copyCommitHash
gitCommitInspect.clear
```

不要一开始加几十个 command。

---

# 23. Activation

Terminal link 必须在用户真正打开 Sidebar 之前也能工作。

因此不能只：

```text
onView:gitCommitInspect.files
```

建议：

```text
onStartupFinished
```

启动后做的事情非常轻：

```text
activate
   ↓
register TerminalLinkProvider
register TreeView
register commands
```

不应该：

```text
扫描 Git log
扫描 commits
扫描 workspace
后台轮询 Git
```

因此 activation 成本应该很低。

---

# 24. 配置项

MVP 尽量少。

可以只有：

```json
{
  "gitCommitInspect.terminalLinks.enabled": true,

  "gitCommitInspect.terminalLinks.minHashLength": 7
}
```

未来再考虑：

```text
files.viewMode
mergeParentMode
autoFocus
terminalLinks.maxHashLength
```

不要一开始配置驱动一切。

---

# 25. Terminal False Positive

类似：

```text
deadbeef
12345678
cafebabe
```

不一定是 Git SHA。

不应该在 Terminal 输出阶段验证，因为太耗性能。

采用：

```text
regex candidate
      ↓
显示 Link
      ↓
用户点击
      ↓
Git validation
```

验证失败：

```text
Unable to resolve Git commit deadbeef
```

即可。

可以后续通过 Terminal Command Detection、repo CWD 等提高准确率，但不属于 MVP。

---

# 26. 并发处理

如果用户快速：

```text
click A
click B
click C
```

最终 Sidebar 应展示：

```text
C
```

不要因为 A 查询最后返回而把 C 覆盖。

可以简单使用：

```ts
let requestId = 0;

async inspectCommit(hash: string) {
  const current = ++requestId;

  const result = await loadCommit(hash);

  if (current !== requestId) {
    return;
  }

  updateUI(result);
}
```

无需一开始构造复杂任务系统。

---

# 27. Cache

MVP 可以提供轻量缓存：

```text
CommitInfo
CommitChanges
RevisionContent
```

Key：

```text
repo + ref
repo + ref + path
```

但必须是：

```text
small
in-memory
bounded
```

例如简单 LRU。

不需要数据库。

不需要：

```text
SQLite
LevelDB
indexedDB
filesystem cache
```

---

# 28. 错误处理

以下情况需要有清晰错误：

### SHA 不存在

```text
Unable to resolve commit 47db09b.
```

### 不在 Git repo

```text
No Git repository found for this commit.
```

### 多 repo 都匹配

打开 QuickPick：

```text
Select repository

frontend
backend
shared
```

### Git extension unavailable

```text
VS Code Git extension is unavailable.
```

### 文件无法读取

```text
Unable to read src/foo.ts at revision 47db09b.
```

不要直接显示：

```text
spawn ENOENT
fatal: ambiguous argument
undefined
```

---

# 29. 不做的功能

这是项目保持轻量最重要的一部分。

## 明确不实现

```text
Git Graph
Commit History Browser
File History
Line History
Blame
CodeLens

Branch Management
Tag Management
Stash Management

Commit
Push
Pull
Fetch
Merge
Rebase
Cherry-pick

GitHub
GitLab
PR
Issues

Remote provider
Avatar

AI

Repository Explorer

Commit Search

Interactive Rebase
```

插件不是：

> Git client。

而是：

> Git commit inspector。

---

# 30. UI 非目标

不要为了复刻 GitLens 截图去做：

```text
WebView
React application
custom virtual DOM
custom Diff UI
custom editor
```

我们只需要截图中左侧这一部分：

```text
Commit Metadata

FILES CHANGED

tree
```

右侧全部：

> 交给 VS Code Native Diff。

---

# 31. 推荐参考项目

不是选择一个项目 Fork，而是分别参考成熟项目的局部实现。

## Microsoft Playwright VS Code Extension

主要参考：

```text
TerminalLinkProvider
```

特别是：

```text
provideTerminalLinks
handleTerminalLink
```

这是 Terminal SHA 自动链接最直接的参考。

---

## microsoft/vscode-extension-samples

### tree-view-sample

参考：

```text
TreeDataProvider
TreeItem
createTreeView
View Container
View toolbar
```

### source-control-sample

重点参考：

```text
revision URI
TextDocumentContentProvider
vscode.diff
```

---

# 32. VS Code 内置 Git Extension

这是 Git backend 最重要的参考。

重点：

```text
extensions/git/
```

研究：

```text
GitExtension
API
Repository
Commit
Change
DiffChange
```

尤其：

```ts
getAPI(1)
getCommit()
diffBetween()
diffBetweenWithStats()
show()
buffer()
```

本项目应使用其中已有能力，而不是重新构建 Git parser。

---

# 33. Git Graph

参考：

```text
mhutchie/vscode-git-graph
```

但：

> **不要 Fork。**

用途只是研究 Git edge cases：

```text
rename
copy
delete
root commit
merge commit
binary
submodule
```

它的整体架构是为了完整 Graph UI 服务的，不适合作为这个 micro-extension 的骨架。

---

# 34. 不建议参考 GitLens 架构

GitLens 有成熟实现，但架构服务于：

```text
大量 Git features
providers
remote integrations
graphs
history
blame
code lenses
cloud
AI
```

本项目照着 GitLens 架构设计，很容易出现：

```text
为了实现 500 行需求
搭出了 10000 行基础设施
```

可以观察 UX 行为，但不要复制其整体架构。

---

# 35. 第一阶段开发顺序

## Phase 1：Terminal → Commit

先只完成：

```text
Terminal SHA
      ↓
click
      ↓
resolve repository
      ↓
console/output 打印 CommitInfo
```

验收：

```bash
git log --oneline
```

能够 Cmd/Ctrl 点击 SHA 并正确解析 commit。

---

## Phase 2：Commit → Files Changed

增加：

```text
getCommitChanges
        ↓
TreeView
```

实现：

```text
47db09b

src/
  foo.ts
  bar.ts
README.md
```

暂时甚至可以不显示 stats。

---

## Phase 3：File → Diff

实现：

```text
FileChangeNode
     ↓
revision URIs
     ↓
vscode.diff
```

完成核心闭环。

到这里已经是可使用的 MVP：

```text
Terminal
→ Commit
→ Files
→ Diff
```

---

## Phase 4：完善 Git Change

增加：

```text
Added
Deleted
Renamed
Root commit
Merge first parent
```

---

## Phase 5：体验优化

最后再做：

```text
+10 -3
icons
tooltip
commit author/date
copy SHA
refresh
focus sidebar
cache
multi-repo QuickPick
```

---

# 36. MVP 验收标准

Agent 完成后至少验证以下场景。

### 普通 Commit

```text
M a.ts
M b.ts
```

要求：

* Terminal SHA 可点击；
* Sidebar 显示两个文件；
* 点击均可打开正确 Diff。

### Added

```text
A new.ts
```

要求：

```text
empty → new.ts
```

### Deleted

```text
D old.ts
```

要求：

```text
old.ts → empty
```

### Rename

```text
R old.ts → new.ts
```

要求 Diff：

```text
parent:old.ts
     ↕
commit:new.ts
```

### Root Commit

要求可以正常 Inspect，不依赖 parent。

### Merge Commit

默认：

```text
first parent ↔ merge commit
```

### Multi Repo

两个 workspace repo 时：

* 正确 repo 可直接解析；
* 多个 repo 都匹配时 QuickPick。

### Invalid SHA

点击：

```text
deadbeef
```

如果不存在，插件不能 crash。

---

# 37. 性能指标

设计目标不是严格 benchmark，但应遵循：

### Extension activation

只做注册操作。

禁止启动时执行：

```bash
git log
git status
git rev-list
```

### Terminal output

每行只做：

```text
regex
```

### Git workload

只有：

```text
用户点击 commit
用户点击 file
```

时才真正访问 Git。

### UI

只使用：

```text
TreeView
Native Diff
```

不创建 Browser/WebView Runtime。

---

# 38. 依赖策略

理想目标：

```text
runtime dependencies ≈ 0
```

尽可能只依赖：

```text
vscode
vscode.git
Node built-ins
```

开发依赖可以：

```text
TypeScript
ESLint
esbuild / tsup
@types/node
@types/vscode
```

不要为了：

```text
path tree
LRU
event emitter
command execution
```

引入额外 npm 包。

Node / VS Code 自身已经足够。

---

# 39. 初步规模预期

合理 MVP 应控制在：

```text
300 ~ 500 LOC
```

包含比较完善的：

```text
Git abstraction
Tree
Diff
Error handling
Rename/root/merge
```

后预计：

```text
500 ~ 1000 LOC
```

量级。

如果第一版很快增长到：

```text
3000+
5000+
10000+
```

应优先检查是否过度设计。

---

# 40. Agent 实现原则

编程 Agent 开始实现前应遵循：

> **先完成最短的 Terminal → Commit → Files → Diff 闭环，再处理边缘能力。**

具体约束：

```text
DO:
✓ TypeScript
✓ VS Code Native API
✓ vscode.git
✓ TreeDataProvider
✓ TerminalLinkProvider
✓ TextDocumentContentProvider
✓ vscode.diff
✓ lazy Git queries
✓ small modules


DON'T:
✗ React
✗ WebView
✗ Git Graph
✗ GitLens dependency
✗ Git history database
✗ background repository scanning
✗ network
✗ telemetry
✗ AI
✗ custom diff renderer
✗ 巨型 Git abstraction
```

---

# 最终产品定义

一句话：

> **一个极轻量的 VS Code Git Commit Inspector：自动识别 Integrated Terminal 中的 Git SHA，Cmd/Ctrl 点击后在 Sidebar 中展示该 Commit 的文件变化，点击文件使用 VS Code 原生 Diff 查看修改。**

整个产品的核心链路只有：

```text
Terminal Git SHA
       │
       ▼
Repository + Commit
       │
       ▼
Files Changed
       │
       ▼
Native VS Code Diff
```

如果 Agent 需要做技术取舍，应始终优先保证这四步简单、快速、可靠，而不是扩展成另一个 GitLens。
