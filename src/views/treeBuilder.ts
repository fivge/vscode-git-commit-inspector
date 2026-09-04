import * as path from "node:path";
import type { CommitChange } from "../git/types";

export interface DirectoryNode {
  readonly type: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: readonly TreeNode[];
}

export interface FileChangeNode {
  readonly type: "file";
  readonly name: string;
  readonly path: string;
  readonly change: CommitChange;
}

export type TreeNode = DirectoryNode | FileChangeNode;

interface MutableDirectoryNode {
  type: "directory";
  name: string;
  path: string;
  children: Map<string, MutableTreeNode>;
}

type MutableTreeNode = MutableDirectoryNode | FileChangeNode;

export function buildChangeTree(changes: readonly CommitChange[]): readonly TreeNode[] {
  const root = new Map<string, MutableTreeNode>();
  for (const change of changes) {
    const parts = change.path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      continue;
    }

    let children = root;
    let currentPath = "";
    for (const directoryName of parts) {
      currentPath = currentPath
        ? path.posix.join(currentPath, directoryName)
        : directoryName;
      const existing = children.get(directoryName);
      if (existing?.type === "directory") {
        children = existing.children;
        continue;
      }

      const directory: MutableDirectoryNode = {
        type: "directory",
        name: directoryName,
        path: currentPath,
        children: new Map(),
      };
      children.set(directoryName, directory);
      children = directory.children;
    }

    children.set(fileName, {
      type: "file",
      name: fileName,
      path: change.path,
      change,
    });
  }

  return finalize(root);
}

function finalize(nodes: Map<string, MutableTreeNode>): readonly TreeNode[] {
  return [...nodes.values()]
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .map((node) =>
      node.type === "directory"
        ? { ...node, children: finalize(node.children) }
        : node,
    );
}
