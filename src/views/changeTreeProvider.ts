import * as vscode from "vscode";
import type { CommitChange, Inspection } from "../git/types";
import { buildChangeTree, type TreeNode } from "./treeBuilder";

export class ChangeTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  private nodes: readonly TreeNode[] = [];
  private view: vscode.TreeView<TreeNode> | undefined;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public attach(view: vscode.TreeView<TreeNode>): void {
    this.view = view;
  }

  public setInspection(inspection: Inspection | undefined): void {
    this.nodes = inspection ? buildChangeTree(inspection.changes) : [];
    if (this.view) {
      this.view.description = inspection ? String(inspection.changes.length) : undefined;
      this.view.message = inspection
        ? inspection.changes.length === 0
          ? "No files changed."
          : undefined
        : "No commit selected.";
    }
    this.changeEmitter.fire(undefined);
  }

  public getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.type === "directory") {
      const item = new vscode.TreeItem(
        node.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "directory";
      return item;
    }

    const item = new vscode.TreeItem(node.name);
    item.description = formatStats(node.change);
    item.tooltip = formatTooltip(node.change);
    item.iconPath = iconFor(node.change.status);
    item.contextValue = `file.${node.change.status}`;
    item.command = {
      command: "gitCommitInspect.openDiff",
      title: "Open Commit Diff",
      arguments: [node.change],
    };
    return item;
  }

  public getChildren(node?: TreeNode): TreeNode[] {
    return node?.type === "directory"
      ? [...node.children]
      : node
        ? []
        : [...this.nodes];
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

function formatStats(change: CommitChange): string {
  const status = statusLetter(change.status);
  const stats = [
    change.additions > 0 ? `+${change.additions}` : undefined,
    change.deletions > 0 ? `-${change.deletions}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return stats ? `${status}  ${stats}` : status;
}

function formatTooltip(change: CommitChange): string {
  const path = change.oldPath
    ? `${change.oldPath} → ${change.path}`
    : change.path;
  return `${statusName(change.status)}\n${path}\n+${change.additions} -${change.deletions}`;
}

function statusLetter(status: CommitChange["status"]): string {
  return status === "unknown" ? "?" : status[0]?.toUpperCase() ?? "?";
}

function statusName(status: CommitChange["status"]): string {
  return status[0]?.toUpperCase() + status.slice(1);
}

function iconFor(status: CommitChange["status"]): vscode.ThemeIcon {
  switch (status) {
    case "added":
      return new vscode.ThemeIcon("diff-added");
    case "deleted":
      return new vscode.ThemeIcon("diff-removed");
    case "renamed":
    case "copied":
      return new vscode.ThemeIcon("diff-renamed");
    case "modified":
      return new vscode.ThemeIcon("diff-modified");
    case "unknown":
      return new vscode.ThemeIcon("question");
  }
}
