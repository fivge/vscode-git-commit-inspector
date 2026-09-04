import * as vscode from "vscode";
import {
  errorMessage,
  type CommitChange,
  type GitService,
  type Inspection,
  InspectorError,
} from "../git/types";
import { createDiffSpec, type RevisionSide } from "./diffSpec";
import { createRevisionUri } from "./revisionUri";

export class DiffController {
  public constructor(
    private readonly git: GitService,
    private readonly getInspection: () => Inspection | undefined,
  ) {}

  public async open(change: CommitChange): Promise<void> {
    const inspection = this.getInspection();
    if (!inspection) {
      void vscode.window.showInformationMessage("No commit is selected.");
      return;
    }

    try {
      const spec = createDiffSpec(inspection.commit, change);
      if (
        (await this.isBinary(inspection, spec.left)) ||
        (await this.isBinary(inspection, spec.right))
      ) {
        void vscode.window.showInformationMessage(
          `Binary diff is not supported: ${change.path}`,
        );
        return;
      }

      const left = createRevisionUri(
        inspection.repository.id,
        spec.left.ref,
        spec.left.path,
      );
      const right = createRevisionUri(
        inspection.repository.id,
        spec.right.ref,
        spec.right.path,
      );
      const title = `${change.oldPath ?? change.path} (${inspection.commit.shortHash})`;
      await vscode.commands.executeCommand("vscode.diff", left, right, title);
    } catch (error) {
      const message =
        error instanceof InspectorError
          ? errorMessage(error)
          : `Unable to open the diff for ${change.path}.`;
      void vscode.window.showErrorMessage(message);
    }
  }

  private async isBinary(
    inspection: Inspection,
    side: RevisionSide,
  ): Promise<boolean> {
    if (!side.ref) {
      return false;
    }
    return this.git.isBinaryFile(
      inspection.repository,
      side.ref,
      side.path,
    );
  }
}
