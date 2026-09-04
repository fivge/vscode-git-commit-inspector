import * as vscode from "vscode";
import {
  errorMessage,
  type GitService,
  type Inspection,
  InspectionCancelledError,
  InspectorError,
} from "../git/types";
import type { RepositoryResolver } from "../git/repositoryResolver";
import type { ChangeTreeProvider } from "../views/changeTreeProvider";
import type { CommitTreeProvider } from "../views/commitTreeProvider";
import { LatestRequest } from "./latestRequest";

export class CommitInspectController {
  private readonly requests = new LatestRequest();
  private inspection: Inspection | undefined;

  public constructor(
    private readonly git: GitService,
    private readonly resolver: RepositoryResolver,
    private readonly commitTree: CommitTreeProvider,
    private readonly changeTree: ChangeTreeProvider,
  ) {}

  public get current(): Inspection | undefined {
    return this.inspection;
  }

  public async inspect(ref: string, cwd?: vscode.Uri): Promise<void> {
    const request = this.requests.next();
    try {
      const resolved = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `Inspecting ${ref}`,
        },
        () => this.resolver.resolve(ref, cwd),
      );
      const changes = await this.git.getCommitChanges(
        resolved.repository,
        resolved.commit,
      );
      if (!this.requests.isCurrent(request)) {
        return;
      }

      this.apply({ ...resolved, changes });
      await vscode.commands.executeCommand(
        "workbench.view.extension.gitCommitInspect",
      );
    } catch (error) {
      if (!this.requests.isCurrent(request) || error instanceof InspectionCancelledError) {
        return;
      }
      void vscode.window.showErrorMessage(errorMessage(error));
    }
  }

  public async inspectFromCommand(ref?: unknown): Promise<void> {
    const suppliedRef = typeof ref === "string" ? ref.trim() : "";
    const selectedRef = suppliedRef || (await vscode.window.showInputBox({
      title: "Inspect Git Commit",
      prompt: "Enter a commit SHA or ref",
      placeHolder: "47db09b",
      validateInput: (value) =>
        value.trim() ? undefined : "A commit SHA or ref is required.",
    }))?.trim();
    if (!selectedRef) {
      return;
    }
    await this.inspect(
      selectedRef,
      vscode.window.activeTerminal?.shellIntegration?.cwd,
    );
  }

  public async refresh(): Promise<void> {
    const previous = this.inspection;
    if (!previous) {
      void vscode.window.showInformationMessage("No commit is selected.");
      return;
    }

    const request = this.requests.next();
    try {
      const commit = await this.git.resolveCommit(
        previous.repository,
        previous.commit.hash,
      );
      const changes = await this.git.getCommitChanges(previous.repository, commit);
      if (this.requests.isCurrent(request)) {
        this.apply({ repository: previous.repository, commit, changes });
      }
    } catch (error) {
      if (this.requests.isCurrent(request)) {
        const message =
          error instanceof InspectorError
            ? errorMessage(error)
            : `Unable to refresh commit ${previous.commit.shortHash}.`;
        void vscode.window.showErrorMessage(message);
      }
    }
  }

  public async copyCommitHash(): Promise<void> {
    if (!this.inspection) {
      void vscode.window.showInformationMessage("No commit is selected.");
      return;
    }
    await vscode.env.clipboard.writeText(this.inspection.commit.hash);
  }

  public clear(): void {
    this.requests.invalidate();
    this.apply(undefined);
  }

  private apply(inspection: Inspection | undefined): void {
    this.inspection = inspection;
    this.commitTree.setCommit(inspection?.commit);
    this.changeTree.setInspection(inspection);
    void vscode.commands.executeCommand(
      "setContext",
      "gitCommitInspect.hasCommit",
      inspection !== undefined,
    );
  }
}
