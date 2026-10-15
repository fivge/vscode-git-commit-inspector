import * as vscode from "vscode";
import type { Inspection } from "../git/types";
import type { TreeNode } from "./treeBuilder";

export type ConfirmCreate = (path: string) => Thenable<boolean>;

const CREATE_FILE = "Create File";

export const confirmCreateFile: ConfirmCreate = async (path) =>
  (await vscode.window.showWarningMessage(
    `"${path}" does not exist in the working tree. Create it?`,
    { modal: true },
    CREATE_FILE,
  )) === CREATE_FILE;

/**
 * Opens the working-tree file for a changed file node. When the file no longer
 * exists, asks whether to create an empty file; the default answer is no.
 */
export async function openWorkspaceFile(
  node: TreeNode | undefined,
  inspection: Inspection | undefined,
  confirm: ConfirmCreate = confirmCreateFile,
): Promise<void> {
  if (!inspection) {
    void vscode.window.showInformationMessage("No commit is selected.");
    return;
  }
  if (node?.type !== "file") return;

  const uri = vscode.Uri.joinPath(inspection.repository.rootUri, node.path);
  if (!(await exists(uri))) {
    if (!(await confirm(node.path))) return;
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
      await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    } catch {
      void vscode.window.showErrorMessage(`Unable to create ${node.path}.`);
      return;
    }
  }
  await vscode.commands.executeCommand("vscode.open", uri);
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
