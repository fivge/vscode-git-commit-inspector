import * as vscode from "vscode";
import { CommitInspectController } from "./commit/commitInspectController";
import { DiffController } from "./diff/diffController";
import { RevisionContentProvider } from "./diff/revisionContentProvider";
import { REVISION_SCHEME } from "./diff/revisionUri";
import { RepositoryResolver } from "./git/repositoryResolver";
import type { CommitChange } from "./git/types";
import { VsCodeGitService } from "./git/vscodeGitService";
import { CommitLinkProvider } from "./terminal/commitLinkProvider";
import { ChangeTreeProvider } from "./views/changeTreeProvider";
import { CommitTreeProvider } from "./views/commitTreeProvider";

export function activate(context: vscode.ExtensionContext): void {
  const git = new VsCodeGitService();
  const resolver = new RepositoryResolver(git);
  const commitTree = new CommitTreeProvider();
  const changeTree = new ChangeTreeProvider();
  const controller = new CommitInspectController(
    git,
    resolver,
    commitTree,
    changeTree,
  );
  const diffController = new DiffController(git, () => controller.current);

  const commitView = vscode.window.createTreeView("gitCommitInspect.commit", {
    treeDataProvider: commitTree,
    showCollapseAll: false,
  });
  const filesView = vscode.window.createTreeView("gitCommitInspect.files", {
    treeDataProvider: changeTree,
    showCollapseAll: true,
  });
  commitTree.attach(commitView);
  changeTree.attach(filesView);
  commitTree.setCommit(undefined);
  changeTree.setInspection(undefined);

  context.subscriptions.push(
    commitTree,
    changeTree,
    commitView,
    filesView,
    vscode.window.registerTerminalLinkProvider(
      new CommitLinkProvider((hash, cwd) => controller.inspect(hash, cwd)),
    ),
    vscode.workspace.registerTextDocumentContentProvider(
      REVISION_SCHEME,
      new RevisionContentProvider(git),
    ),
    vscode.commands.registerCommand(
      "gitCommitInspect.inspectCommit",
      (ref?: unknown) => controller.inspectFromCommand(ref),
    ),
    vscode.commands.registerCommand("gitCommitInspect.refresh", () =>
      controller.refresh(),
    ),
    vscode.commands.registerCommand("gitCommitInspect.copyCommitHash", () =>
      controller.copyCommitHash(),
    ),
    vscode.commands.registerCommand("gitCommitInspect.clear", () =>
      controller.clear(),
    ),
    vscode.commands.registerCommand(
      "gitCommitInspect.openDiff",
      (change: CommitChange) => diffController.open(change),
    ),
  );
}

export function deactivate(): void {}
