import type { CommitChange, CommitInfo } from "../git/types";

export interface RevisionSide {
  readonly ref: string | undefined;
  readonly path: string;
}

export interface DiffSpec {
  readonly left: RevisionSide;
  readonly right: RevisionSide;
}

export function createDiffSpec(
  commit: CommitInfo,
  change: CommitChange,
): DiffSpec {
  const parent = commit.parents[0];
  switch (change.status) {
    case "added":
      return {
        left: { ref: undefined, path: change.path },
        right: { ref: commit.hash, path: change.path },
      };
    case "deleted":
      return {
        left: { ref: parent, path: change.path },
        right: { ref: undefined, path: change.path },
      };
    case "renamed":
    case "copied":
      return {
        left: { ref: parent, path: change.oldPath ?? change.path },
        right: { ref: commit.hash, path: change.path },
      };
    case "modified":
    case "unknown":
      return {
        left: { ref: parent, path: change.path },
        right: { ref: commit.hash, path: change.path },
      };
  }
}
