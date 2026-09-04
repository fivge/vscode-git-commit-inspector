import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as vscode from "vscode";
import {
  createRevisionUri,
  decodeRevisionUri,
} from "../../../src/diff/revisionUri";
import { VsCodeGitService } from "../../../src/git/vscodeGitService";

export async function run(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  assert.ok(root, "The Git fixture workspace should be open");

  const extension = vscode.extensions.all.find(
    (candidate) => candidate.packageJSON.name === "git-commit-inspector",
  );
  assert.ok(extension, "The extension should be installed in the test host");
  await extension.activate();

  const hash = git(root.fsPath, "rev-parse", "test-modified");
  await vscode.commands.executeCommand("gitCommitInspect.inspectCommit", hash);

  const uri = createRevisionUri(root.toString(), hash, "sample.ts");
  assert.deepEqual(decodeRevisionUri(uri), {
    repositoryId: root.toString(),
    ref: hash,
    filePath: "sample.ts",
    empty: false,
  });
  const document = await vscode.workspace.openTextDocument(uri);
  assert.equal(document.getText(), "export const value = 2;\n");

  const emptyDocument = await vscode.workspace.openTextDocument(
    createRevisionUri(root.toString(), undefined, "space ü.ts"),
  );
  assert.equal(emptyDocument.getText(), "");

  const gitService = new VsCodeGitService();
  const repository = await gitService.getRepositoryForUri(root);
  assert.ok(repository, "The fixture repository should be discovered");

  const rootCommit = await gitService.resolveCommit(repository, "test-root");
  assert.equal(rootCommit.parents.length, 0);
  assert.deepEqual(
    (await gitService.getCommitChanges(repository, rootCommit)).map(
      (change) => change.status,
    ),
    ["added"],
  );

  const cases = [
    ["test-added", "added", "added.ts"],
    ["test-modified", "modified", "sample.ts"],
    ["test-renamed", "renamed", "renamed.ts"],
    ["test-deleted", "deleted", "added.ts"],
  ] as const;
  for (const [ref, status, path] of cases) {
    const commit = await gitService.resolveCommit(repository, ref);
    const changes = await gitService.getCommitChanges(repository, commit);
    assert.ok(
      changes.some((change) => change.status === status && change.path === path),
      `${ref} should contain ${status} ${path}`,
    );
  }

  const renamed = await gitService.resolveCommit(repository, "test-renamed");
  const renameChange = (await gitService.getCommitChanges(repository, renamed)).find(
    (change) => change.status === "renamed",
  );
  assert.equal(renameChange?.oldPath, "sample.ts");

  const merge = await gitService.resolveCommit(repository, "test-merge");
  assert.equal(merge.parents.length, 2);
  assert.ok(
    (await gitService.getCommitChanges(repository, merge)).some(
      (change) => change.path === "feature.ts",
    ),
    "Merge changes should be calculated against the first parent",
  );

  assert.equal(
    await gitService.isBinaryFile(repository, "test-binary", "binary.bin"),
    true,
  );

  await vscode.commands.executeCommand("gitCommitInspect.clear");
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}
