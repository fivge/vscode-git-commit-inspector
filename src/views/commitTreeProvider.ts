import * as vscode from "vscode";
import type { CommitInfo } from "../git/types";

type CommitNode =
  | { readonly kind: "hash"; readonly commit: CommitInfo }
  | { readonly kind: "author"; readonly commit: CommitInfo }
  | { readonly kind: "date"; readonly commit: CommitInfo };

export class CommitTreeProvider
  implements vscode.TreeDataProvider<CommitNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<CommitNode | undefined>();
  private commit: CommitInfo | undefined;
  private view: vscode.TreeView<CommitNode> | undefined;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public attach(view: vscode.TreeView<CommitNode>): void {
    this.view = view;
  }

  public setCommit(commit: CommitInfo | undefined): void {
    this.commit = commit;
    if (this.view) {
      this.view.description = commit?.shortHash;
      this.view.message = commit ? undefined : "Click a commit SHA in the terminal.";
    }
    this.changeEmitter.fire(undefined);
  }

  public getTreeItem(node: CommitNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.kind === "hash" ? node.commit.shortHash : labelFor(node.kind),
    );
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;
    switch (node.kind) {
      case "hash":
        item.description = firstLine(node.commit.message);
        item.iconPath = new vscode.ThemeIcon("git-commit");
        item.tooltip = `${node.commit.hash}\n\n${node.commit.message}`;
        item.command = {
          command: "gitCommitInspect.copyCommitHash",
          title: "Copy Commit Hash",
        };
        break;
      case "author":
        item.description = formatAuthor(node.commit);
        item.iconPath = new vscode.ThemeIcon("account");
        break;
      case "date":
        item.description = formatDate(node.commit);
        item.iconPath = new vscode.ThemeIcon("calendar");
        break;
    }
    return item;
  }

  public getChildren(): CommitNode[] {
    if (!this.commit) {
      return [];
    }
    return [
      { kind: "hash", commit: this.commit },
      { kind: "author", commit: this.commit },
      { kind: "date", commit: this.commit },
    ];
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

function labelFor(kind: Exclude<CommitNode["kind"], "hash">): string {
  switch (kind) {
    case "author":
      return "Author";
    case "date":
      return "Date";
  }
}

function firstLine(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? "";
}

function formatAuthor(commit: CommitInfo): string {
  const name = commit.authorName ?? "Unknown";
  return commit.authorEmail ? `${name} <${commit.authorEmail}>` : name;
}

function formatDate(commit: CommitInfo): string {
  const date = commit.authorDate ?? commit.commitDate;
  return date ? date.toLocaleString() : "Unknown";
}
