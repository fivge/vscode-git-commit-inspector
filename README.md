# Git Commit Inspector

在 VS Code 集成终端中点击 Git commit SHA，立即查看该提交修改的文件，并使用 VS Code 原生 Diff Editor 检查具体变更。

## 功能特点

- 自动识别集成终端中的短 SHA 和完整 SHA。
- 优先根据当前终端目录定位 Git 仓库，支持多仓库工作区。
- 在侧边栏中以文件树展示新增、修改、删除、重命名和复制的文件。
- 文件与目录图标跟随当前 VS Code 文件图标主题。
- 显示每个文件的变更状态及增删行数。
- 点击文件后使用 VS Code 原生 Diff Editor 查看变更。
- 展示 commit ID、完整消息、作者和时间，支持右键复制。
- 支持普通提交、根提交和合并提交；合并提交默认与第一个父提交比较。
- 所有 Git 数据均来自本地仓库，不需要网络服务。

## 安装

在 VS Code 扩展视图中搜索 **Git Commit Inspector** 并安装。也可以下载 `.vsix` 文件，然后从扩展视图右上角的菜单中选择 **Install from VSIX...**。

## 使用方法

1. 在 VS Code 中打开一个 Git 仓库。
2. 在集成终端运行会输出 commit SHA 的命令，例如：

   ```bash
   git log --oneline
   ```

3. 按住 `Ctrl`（Windows/Linux）或 `Cmd`（macOS），点击终端中的 commit SHA。
4. 扩展会打开 **Commit Inspect** 侧边栏，并在 **Files Changed** 中列出该提交的文件变化。
5. 点击文件即可打开该文件在父提交与当前提交之间的 Diff。

也可以打开命令面板，执行 **Git Commit Inspector: Inspect Commit...**，然后输入 commit SHA、分支、标签或其他 Git ref。

## 侧边栏

**Files Changed** 显示提交涉及的目录和文件。文件右侧会显示状态以及增删行数：

| 状态 | 含义 |
| --- | --- |
| `M` | Modified，已修改 |
| `A` | Added，已新增 |
| `D` | Deleted，已删除 |
| `R` | Renamed，已重命名 |
| `C` | Copied，已复制 |
| `?` | 未知状态 |

点击刷新按钮会重新读取当前提交，并展开全部目录。标题栏中的全部折叠按钮可以快速收起文件树。

**Commit** 显示 commit ID、消息、作者和提交时间。将鼠标悬停在消息上可以查看完整的多行内容；右键点击任意信息行可以复制对应内容。

## 配置

在 VS Code 设置中搜索 `Git Commit Inspector`：

| 设置 | 默认值 | 说明 |
| --- | ---: | --- |
| `gitCommitInspect.terminalLinks.enabled` | `true` | 是否识别集成终端中的 commit SHA。 |
| `gitCommitInspect.terminalLinks.minHashLength` | `7` | 被识别为 SHA 的最小长度，可设置为 4–40。 |

## 仓库定位

扩展首先尝试使用终端当前目录所属的 Git 仓库。如果无法确定，则检查当前工作区中由 VS Code Git 扩展发现的其他仓库。

如果终端当前目录所属的仓库可以解析该 ref，扩展会直接使用它；否则，当多个工作区仓库都能解析该 ref 时，扩展会显示仓库选择列表。工作区中没有 Git 仓库，或 ref 无法解析时，会显示相应的错误信息。

## 使用限制

- 依赖 VS Code 内置 Git 扩展；该扩展需要处于启用状态。
- 二进制文件不会打开文本 Diff，扩展会显示提示信息。
- 合并提交当前固定与第一个父提交比较。
- 终端中的十六进制文本可能被识别为 SHA；扩展仅在点击后向 Git 验证它是否为有效提交。

## 开发

项目使用 Bun、TypeScript 和 esbuild：

```bash
bun install
bun run check
bun run lint
bun test
bun run build
```

在 VS Code 中打开本仓库并运行 `Run Extension` 调试配置。完整的架构、数据流、边缘情况和验证策略参阅[技术设计文档](docs/technical-design.md)。

## 构建与发布

### GitHub Actions 构建

仓库中的 **Build VSIX** 工作流支持两种触发方式：

- 在 GitHub 仓库的 **Actions → Build VSIX → Run workflow** 页面手动运行；请选择 `main` 分支。
- 修改 `package.json` 并推送到 `main` 时自动运行。

工作流使用 `package.json` 中的 `version` 作为版本号，并将产物命名为 `git-commit-inspector-<version>.vsix`。构建通过后，产物会上传到 `v<version>` 对应的 GitHub 草稿 Release；审核完成后可在 Releases 页面手动公开。

如果对应 Release 已经包含同名 VSIX，工作流会直接成功结束，不会重复安装依赖、测试或打包。发布新版本前必须先把 `package.json` 中的版本递增为新的 `X.Y.Z`。

### 发布到 VS Code Marketplace

1. 登录 [Visual Studio Marketplace Publisher 管理页](https://marketplace.visualstudio.com/manage)，创建或确认拥有 ID 为 `fivge` 的 Publisher。这个 ID 必须与 `package.json` 中的 `publisher` 一致。
2. 从 GitHub 草稿 Release 下载 VSIX，在 VS Code 扩展视图右上角菜单中选择 **Install from VSIX...**，完成最终安装验证。
3. 在 Publisher 管理页选择新增 VS Code 扩展并上传该 VSIX。后续版本仍需先递增 `package.json.version`，已经发布过的版本号不能重复使用。

也可以在本地通过 `bunx vsce publish --packagePath git-commit-inspector-X.Y.Z.vsix` 发布。认证与 Publisher 创建步骤参阅 [VS Code 官方发布指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。

本仓库暂不在 GitHub Actions 中保存 Marketplace 发布凭据。如果以后增加自动发布，应优先采用 Microsoft Entra ID 工作负载身份和 `vsce publish --azure-credential`；Azure DevOps 全局 Personal Access Token 将于 2026 年 12 月 1 日退役。

## License

[MIT](LICENSE)
