import type { Uri } from "vscode";

export type ChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unknown";

export interface RepositoryRef {
  readonly id: string;
  readonly rootUri: Uri;
}

export interface CommitInfo {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly authorName?: string;
  readonly authorEmail?: string;
  readonly authorDate?: Date;
  readonly commitDate?: Date;
  readonly parents: readonly string[];
}

export interface CommitChange {
  readonly status: ChangeStatus;
  readonly path: string;
  readonly oldPath?: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface Inspection {
  readonly repository: RepositoryRef;
  readonly commit: CommitInfo;
  readonly changes: readonly CommitChange[];
}

export interface GitService {
  getRepositories(): Promise<readonly RepositoryRef[]>;
  getRepositoryForUri(uri: Uri): Promise<RepositoryRef | undefined>;
  resolveCommit(repository: RepositoryRef, ref: string): Promise<CommitInfo>;
  getCommitChanges(
    repository: RepositoryRef,
    commit: CommitInfo,
  ): Promise<readonly CommitChange[]>;
  getFileAtRevision(
    repository: RepositoryRef,
    ref: string,
    filePath: string,
  ): Promise<string>;
  isBinaryFile(
    repository: RepositoryRef,
    ref: string,
    filePath: string,
  ): Promise<boolean>;
}

export class InspectorError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InspectorError";
  }
}

export class InspectionCancelledError extends InspectorError {
  public constructor() {
    super("Commit inspection was cancelled.");
    this.name = "InspectionCancelledError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof InspectorError
    ? error.message
    : "Git Commit Inspector encountered an unexpected error.";
}
