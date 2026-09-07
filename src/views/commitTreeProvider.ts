import * as vscode from "vscode";
import type { CommitInfo } from "../git/types";

export type CommitNode =
  | { readonly kind: "hash"; readonly commit: CommitInfo }
  | { readonly kind: "message"; readonly commit: CommitInfo }
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
    const item = new vscode.TreeItem(labelFor(node));
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;
    item.contextValue = "commitInfo.copyable";
    const copyValue = valueFor(node);
    switch (node.kind) {
      case "hash":
        item.iconPath = new vscode.ThemeIcon("git-commit");
        item.tooltip = node.commit.hash;
        break;
      case "message":
        item.iconPath = new vscode.ThemeIcon("comment");
        item.tooltip = messageTooltip(node.commit.message);
        break;
      case "author":
        item.iconPath = new vscode.ThemeIcon("account");
        item.tooltip = copyValue;
        break;
      case "date":
        item.iconPath = new vscode.ThemeIcon("calendar");
        item.tooltip = copyValue;
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
      { kind: "message", commit: this.commit },
      { kind: "author", commit: this.commit },
      { kind: "date", commit: this.commit },
    ];
  }

  public async copy(node: CommitNode | undefined): Promise<void> {
    if (node) {
      await vscode.env.clipboard.writeText(valueFor(node));
    }
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

function labelFor(node: CommitNode): string {
  switch (node.kind) {
    case "hash":
      return node.commit.shortHash;
    case "message":
      return firstLine(node.commit.message);
    case "author":
      return formatAuthor(node.commit);
    case "date":
      return formatDate(node.commit);
  }
}

function valueFor(node: CommitNode): string {
  switch (node.kind) {
    case "hash":
      return node.commit.hash;
    case "message":
      return node.commit.message;
    case "author":
      return formatAuthor(node.commit);
    case "date":
      return formatDate(node.commit);
  }
}

function messageTooltip(message: string): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendText(message);
  return tooltip;
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
