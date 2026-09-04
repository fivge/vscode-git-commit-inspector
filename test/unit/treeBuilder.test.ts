import { describe, expect, test } from "bun:test";
import type { CommitChange } from "../../src/git/types";
import { buildChangeTree } from "../../src/views/treeBuilder";

const change = (filePath: string): CommitChange => ({
  status: "modified",
  path: filePath,
  additions: 1,
  deletions: 2,
});

describe("buildChangeTree", () => {
  test("builds and sorts directories before files", () => {
    const tree = buildChangeTree([
      change("README.md"),
      change("src/z.ts"),
      change("src/components/a.ts"),
      change("docs/guide.md"),
    ]);

    expect(tree.map((node) => `${node.type}:${node.name}`)).toEqual([
      "directory:docs",
      "directory:src",
      "file:README.md",
    ]);
    const src = tree[1];
    expect(src?.type).toBe("directory");
    if (src?.type === "directory") {
      expect(src.children.map((node) => node.name)).toEqual(["components", "z.ts"]);
    }
  });

  test("keeps rename metadata on the file node", () => {
    const renamed: CommitChange = {
      status: "renamed",
      path: "new/name.ts",
      oldPath: "old/name.ts",
      additions: 0,
      deletions: 0,
    };
    const tree = buildChangeTree([renamed]);
    const directory = tree[0];
    expect(directory?.type).toBe("directory");
    if (directory?.type === "directory") {
      const file = directory.children[0];
      expect(file?.type === "file" ? file.change : undefined).toEqual(renamed);
    }
  });
});
