import type { Event, Extension, Uri } from "vscode";

export const enum GitStatus {
  IndexModified = 0,
  IndexAdded = 1,
  IndexDeleted = 2,
  IndexRenamed = 3,
  IndexCopied = 4,
  Modified = 5,
  Deleted = 6,
  Untracked = 7,
  TypeChanged = 11,
}

export interface VsCodeGitCommit {
  readonly hash: string;
  readonly message: string;
  readonly parents: readonly string[];
  readonly authorDate?: Date;
  readonly authorName?: string;
  readonly authorEmail?: string;
  readonly commitDate?: Date;
}

export interface VsCodeGitDiffChange {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri: Uri | undefined;
  readonly status: GitStatus;
  readonly insertions: number;
  readonly deletions: number;
}

export interface VsCodeGitRepository {
  readonly rootUri: Uri;
  getCommit(ref: string): Promise<VsCodeGitCommit>;
  diffBetweenWithStats(
    ref1: string,
    ref2: string,
    path?: string,
  ): Promise<VsCodeGitDiffChange[]>;
  getObjectDetails(
    treeish: string,
    path: string,
  ): Promise<{ mode: string; object: string; size: number }>;
  detectObjectType(
    object: string,
  ): Promise<{ mimetype: string; encoding?: string }>;
  show(ref: string, path: string): Promise<string>;
}

export interface VsCodeGitApi {
  readonly state: "uninitialized" | "initialized";
  readonly onDidChangeState: Event<"uninitialized" | "initialized">;
  readonly repositories: readonly VsCodeGitRepository[];
  getRepository(uri: Uri): VsCodeGitRepository | null;
}

export interface VsCodeGitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): VsCodeGitApi;
}

export type GitExtensionHandle = Extension<VsCodeGitExtension>;
