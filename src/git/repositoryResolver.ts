import * as path from "node:path";
import * as vscode from "vscode";
import {
  type GitService,
  InspectionCancelledError,
  InspectorError,
} from "./types";
import { findCommitMatches, type ResolvedCommit } from "./findCommitMatches";

export class RepositoryResolver {
  public constructor(private readonly git: GitService) {}

  public async resolve(ref: string, cwd?: vscode.Uri): Promise<ResolvedCommit> {
    const repositories = await this.git.getRepositories();
    if (repositories.length === 0) {
      throw new InspectorError("No Git repository is open in this workspace.");
    }

    const cwdRepository = cwd
      ? await this.git.getRepositoryForUri(cwd)
      : undefined;
    const matches = await findCommitMatches(
      this.git,
      repositories,
      ref,
      cwdRepository,
    );

    if (matches.length === 0) {
      throw new InspectorError(`Unable to resolve Git commit ${ref}.`);
    }
    if (matches.length === 1) {
      return matches[0]!;
    }

    const selected = await vscode.window.showQuickPick(
      matches.map((match) => ({
        label: path.posix.basename(match.repository.rootUri.path),
        description: match.repository.rootUri.toString(true),
        match,
      })),
      { placeHolder: `Select the repository for ${ref}` },
    );
    if (!selected) {
      throw new InspectionCancelledError();
    }
    return selected.match;
  }
}
