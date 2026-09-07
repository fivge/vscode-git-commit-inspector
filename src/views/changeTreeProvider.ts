import * as vscode from "vscode";
import type { CommitChange, Inspection } from "../git/types";
import { buildChangeTree, type TreeNode } from "./treeBuilder";

export class ChangeTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  private nodes: readonly TreeNode[] = [];
  private view: vscode.TreeView<TreeNode> | undefined;
  private rootUri: vscode.Uri | undefined;
  private readonly parents = new Map<TreeNode, TreeNode>();
  private generation = 0;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public attach(view: vscode.TreeView<TreeNode>): void {
    this.view = view;
  }

  public setInspection(inspection: Inspection | undefined): void {
    this.generation++;
    this.rootUri = inspection?.repository.rootUri;
    this.nodes = inspection ? buildChangeTree(inspection.changes) : [];
    this.parents.clear();
    const indexParents = (nodes: readonly TreeNode[], parent?: TreeNode): void => {
      for (const node of nodes) {
        if (parent) this.parents.set(node, parent);
        if (node.type === "directory") indexParents(node.children, node);
      }
    };
    indexParents(this.nodes);
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
      item.resourceUri = this.resourceUri(node);
      item.contextValue = "directory";
      return item;
    }

    const item = new vscode.TreeItem(node.name);
    item.description = formatStats(node.change);
    item.tooltip = formatTooltip(node.change);
    item.iconPath = vscode.ThemeIcon.File;
    item.resourceUri = this.resourceUri(node);
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

  public getParent(node: TreeNode): TreeNode | undefined {
    return this.parents.get(node);
  }

  public async expandAll(): Promise<void> {
    const view = this.view;
    if (!view) return;
    const generation = ++this.generation;
    const pending = [...this.nodes].reverse();
    while (pending.length > 0 && generation === this.generation) {
      const node = pending.pop()!;
      if (node.type !== "directory") continue;
      try {
        // reveal only supports up to three levels; visit every directory instead.
        await view.reveal(node, { expand: true, select: false, focus: false });
      } catch (error) {
        if (generation !== this.generation) return;
        throw error;
      }
      pending.push(...[...node.children].reverse());
    }
  }

  private resourceUri(node: TreeNode): vscode.Uri | undefined {
    return this.rootUri ? vscode.Uri.joinPath(this.rootUri, node.path) : undefined;
  }

  public dispose(): void {
    this.generation++;
    this.parents.clear();
    this.view = undefined;
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
