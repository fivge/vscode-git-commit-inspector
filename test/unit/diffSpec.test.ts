import { describe, expect, test } from "bun:test";
import { createDiffSpec } from "../../src/diff/diffSpec";
import type { CommitChange, CommitInfo } from "../../src/git/types";

const commit: CommitInfo = {
  hash: "bbbbbbbb",
  shortHash: "bbbbbbb",
  message: "test",
  parents: ["aaaaaaaa", "cccccccc"],
};

const change = (
  status: CommitChange["status"],
  path = "src/new.ts",
  oldPath?: string,
): CommitChange => ({ status, path, oldPath, additions: 1, deletions: 1 });

describe("createDiffSpec", () => {
  test("uses the first parent for modified merge commits", () => {
    expect(createDiffSpec(commit, change("modified"))).toEqual({
      left: { ref: "aaaaaaaa", path: "src/new.ts" },
      right: { ref: "bbbbbbbb", path: "src/new.ts" },
    });
  });

  test("uses empty sides for added and deleted files", () => {
    expect(createDiffSpec(commit, change("added")).left.ref).toBeUndefined();
    expect(createDiffSpec(commit, change("deleted")).right.ref).toBeUndefined();
  });

  test("uses the old path for renamed and copied files", () => {
    for (const status of ["renamed", "copied"] as const) {
      expect(createDiffSpec(commit, change(status, "new.ts", "old.ts")).left).toEqual({
        ref: "aaaaaaaa",
        path: "old.ts",
      });
    }
  });

  test("represents a root commit as empty to commit", () => {
    const root = { ...commit, parents: [] };
    expect(createDiffSpec(root, change("added"))).toEqual({
      left: { ref: undefined, path: "src/new.ts" },
      right: { ref: "bbbbbbbb", path: "src/new.ts" },
    });
  });
});
