import type * as vscode from "vscode";
import { InspectorError, type GitService } from "../git/types";
import { decodeRevisionUri } from "./revisionUri";

export class RevisionContentProvider
  implements vscode.TextDocumentContentProvider
{
  public constructor(private readonly git: GitService) {}

  public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const revision = decodeRevisionUri(uri);
    if (revision.empty) {
      return "";
    }

    const repositories = await this.git.getRepositories();
    const repository = repositories.find(
      (candidate) => candidate.id === revision.repositoryId,
    );
    if (!repository || !revision.ref) {
      throw new InspectorError("The repository for this revision is unavailable.");
    }
    return this.git.getFileAtRevision(
      repository,
      revision.ref,
      revision.filePath,
    );
  }
}
