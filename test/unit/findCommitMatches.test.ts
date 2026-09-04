import { describe, expect, test } from "bun:test";
import {
  findCommitMatches,
  type CommitResolver,
} from "../../src/git/findCommitMatches";
import type { CommitInfo, RepositoryRef } from "../../src/git/types";

const repo = (id: string): RepositoryRef =>
  ({ id, rootUri: { path: `/${id}` } }) as RepositoryRef;
const commit = (hash: string): CommitInfo => ({
  hash,
  shortHash: hash.slice(0, 7),
  message: hash,
  parents: [],
});

describe("findCommitMatches", () => {
  test("returns the preferred cwd repository without querying the rest", async () => {
    const calls: string[] = [];
    const resolver: CommitResolver = {
      async resolveCommit(repository) {
        calls.push(repository.id);
        return commit("aaaaaaaa");
      },
    };
    const preferred = repo("cwd");
    const matches = await findCommitMatches(
      resolver,
      [preferred, repo("other")],
      "aaaaaaa",
      preferred,
    );
    expect(matches.map((match) => match.repository.id)).toEqual(["cwd"]);
    expect(calls).toEqual(["cwd"]);
  });

  test("checks all other repositories when the preferred one misses", async () => {
    const resolver: CommitResolver = {
      async resolveCommit(repository) {
        if (repository.id === "cwd" || repository.id === "miss") {
          throw new Error("missing");
        }
        return commit("bbbbbbbb");
      },
    };
    const preferred = repo("cwd");
    const matches = await findCommitMatches(
      resolver,
      [preferred, repo("one"), repo("miss"), repo("two")],
      "bbbbbbb",
      preferred,
    );
    expect(matches.map((match) => match.repository.id)).toEqual(["one", "two"]);
  });
});
