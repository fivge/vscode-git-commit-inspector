import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Inspection } from "../../../src/git/types";
import { ChangeTreeProvider } from "../../../src/views/changeTreeProvider";
import type { TreeNode } from "../../../src/views/treeBuilder";

export async function testChangeTree(inspection: Inspection): Promise<void> {
  const provider = new ChangeTreeProvider();
  const fixture: Inspection = {
    ...inspection,
    changes: [
      { path: "src/a/b/c/d/space ü.ts", status: "deleted", additions: 0, deletions: 2 },
      { path: "test/new.json", oldPath: "old.json", status: "renamed", additions: 1, deletions: 0 },
    ],
  };
  const visited: string[] = [];
  let onReveal: (() => Promise<void>) | undefined;
  const view = {
    reveal: async (node: TreeNode, options: unknown) => {
      assert.deepEqual(options, { expand: true, select: false, focus: false });
      visited.push(node.path);
      await onReveal?.();
    },
  } as unknown as vscode.TreeView<TreeNode>;
  provider.attach(view);
  try {
    provider.setInspection(fixture);
    const checkNodes = (nodes: TreeNode[], parent?: TreeNode): void => {
      for (const node of nodes) {
        assert.equal(provider.getParent(node), parent);
        const item = provider.getTreeItem(node);
        assert.equal(item.resourceUri?.toString(), vscode.Uri.joinPath(fixture.repository.rootUri, node.path).toString());
        assert.equal(item.iconPath, node.type === "directory" ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File);
        if (node.type === "directory") {
          checkNodes(provider.getChildren(node), node);
        } else {
          assert.equal(item.command?.command, "gitCommitInspect.openDiff");
          assert.deepEqual(item.command.arguments, [node.change]);
          assert.equal(item.description, node.change.status === "deleted" ? "D  -2" : "R  +1");
        }
      }
    };
    checkNodes(provider.getChildren());
    await provider.expandAll();
    assert.deepEqual(visited, ["src", "src/a", "src/a/b", "src/a/b/c", "src/a/b/c/d", "test"]);

    // Replacing or clearing the tree while reveal is pending cancels old nodes,
    // including a reveal rejection caused by their removal from the view.
    for (const replacement of [fixture, undefined]) {
      provider.setInspection(fixture);
      visited.length = 0;
      onReveal = async () => {
        provider.setInspection(replacement);
        throw new Error("The old node was removed");
      };
      await provider.expandAll();
      assert.deepEqual(visited, ["src"]);
    }
    onReveal = undefined;
    visited.length = 0;
    await provider.expandAll();
    assert.deepEqual(visited, []);

    provider.setInspection(fixture);
    onReveal = async () => { throw new Error("Unexpected reveal failure"); };
    await assert.rejects(provider.expandAll(), /Unexpected reveal failure/);
  } finally {
    provider.dispose();
  }
}
