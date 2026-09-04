import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

const extensionDevelopmentPath = resolve(import.meta.dir, "../..");
const extensionTestsPath = resolve(
  extensionDevelopmentPath,
  "dist/test/suite/index.js",
);
const fixture = mkdtempSync(join(tmpdir(), "git-commit-inspector-"));

try {
  execFileSync("git", ["init", fixture]);
  execFileSync("git", ["-C", fixture, "config", "user.name", "Inspector Test"]);
  execFileSync("git", ["-C", fixture, "config", "user.email", "test@example.com"]);
  writeFileSync(join(fixture, "sample.ts"), "export const value = 1;\n");
  execFileSync("git", ["-C", fixture, "add", "sample.ts"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "root"]);
  execFileSync("git", ["-C", fixture, "tag", "test-root"]);

  writeFileSync(join(fixture, "added.ts"), "export const added = true;\n");
  execFileSync("git", ["-C", fixture, "add", "added.ts"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "add file"]);
  execFileSync("git", ["-C", fixture, "tag", "test-added"]);

  writeFileSync(join(fixture, "sample.ts"), "export const value = 2;\n");
  execFileSync("git", ["-C", fixture, "commit", "-am", "modify sample"]);
  execFileSync("git", ["-C", fixture, "tag", "test-modified"]);

  execFileSync("git", ["-C", fixture, "mv", "sample.ts", "renamed.ts"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "rename sample"]);
  execFileSync("git", ["-C", fixture, "tag", "test-renamed"]);

  rmSync(join(fixture, "added.ts"));
  execFileSync("git", ["-C", fixture, "add", "-u"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "delete file"]);
  execFileSync("git", ["-C", fixture, "tag", "test-deleted"]);

  const mainBranch = execFileSync(
    "git",
    ["-C", fixture, "branch", "--show-current"],
    { encoding: "utf8" },
  ).trim();
  execFileSync("git", ["-C", fixture, "checkout", "-b", "feature"]);
  writeFileSync(join(fixture, "feature.ts"), "export const feature = true;\n");
  execFileSync("git", ["-C", fixture, "add", "feature.ts"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "feature"]);
  execFileSync("git", ["-C", fixture, "checkout", mainBranch]);
  writeFileSync(join(fixture, "main.ts"), "export const main = true;\n");
  execFileSync("git", ["-C", fixture, "add", "main.ts"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "main"]);
  execFileSync("git", ["-C", fixture, "merge", "--no-ff", "feature", "-m", "merge"]);
  execFileSync("git", ["-C", fixture, "tag", "test-merge"]);

  writeFileSync(join(fixture, "binary.bin"), Buffer.from([0, 1, 2, 0, 255]));
  execFileSync("git", ["-C", fixture, "add", "binary.bin"]);
  execFileSync("git", ["-C", fixture, "commit", "-m", "binary"]);
  execFileSync("git", ["-C", fixture, "tag", "test-binary"]);

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [fixture, "--disable-extensions"],
  });
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
