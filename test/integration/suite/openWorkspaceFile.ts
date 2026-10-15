import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Inspection } from "../../../src/git/types";
import { openWorkspaceFile } from "../../../src/views/openWorkspaceFile";
import type { TreeNode } from "../../../src/views/treeBuilder";

export async function testOpenWorkspaceFile(inspection: Inspection): Promise<void> {
  const root = inspection.repository.rootUri;
  const fileNode = (path: string): TreeNode => ({
    type: "file",
    name: path.split("/").pop()!,
    path,
    change: { path, status: "deleted", additions: 0, deletions: 1 },
  });
  const activePath = () => vscode.window.activeTextEditor?.document.uri.toString();

  // Existing file opens directly without asking.
  await openWorkspaceFile(fileNode("renamed.ts"), inspection, async () => {
    throw new Error("confirm should not be called for an existing file");
  });
  assert.equal(activePath(), vscode.Uri.joinPath(root, "renamed.ts").toString());

  // Missing file: declining (the default) leaves it missing.
  const missing = vscode.Uri.joinPath(root, "nested/dir/missing.ts");
  const asked: string[] = [];
  await openWorkspaceFile(fileNode("nested/dir/missing.ts"), inspection, async (path) => {
    asked.push(path);
    return false;
  });
  assert.deepEqual(asked, ["nested/dir/missing.ts"]);
  await assert.rejects(Promise.resolve(vscode.workspace.fs.stat(missing)));

  // Missing file: accepting creates an empty file and opens it.
  await openWorkspaceFile(fileNode("nested/dir/missing.ts"), inspection, async () => true);
  assert.equal((await vscode.workspace.fs.readFile(missing)).byteLength, 0);
  assert.equal(activePath(), missing.toString());

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.workspace.fs.delete(vscode.Uri.joinPath(root, "nested"), { recursive: true });
}
