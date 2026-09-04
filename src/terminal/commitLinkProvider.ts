import * as vscode from "vscode";
import { scanCommitHashes } from "./hashScanner";

export interface CommitTerminalLink extends vscode.TerminalLink {
  readonly hash: string;
  readonly terminal: vscode.Terminal;
}

export class CommitLinkProvider
  implements vscode.TerminalLinkProvider<CommitTerminalLink>
{
  public constructor(
    private readonly inspect: (
      hash: string,
      cwd: vscode.Uri | undefined,
    ) => Promise<void>,
  ) {}

  public provideTerminalLinks(
    context: vscode.TerminalLinkContext,
  ): vscode.ProviderResult<CommitTerminalLink[]> {
    const config = vscode.workspace.getConfiguration("gitCommitInspect.terminalLinks");
    if (!config.get("enabled", true)) {
      return [];
    }

    const minimumLength = config.get("minHashLength", 7);
    return scanCommitHashes(context.line, minimumLength).map((candidate) => ({
      ...candidate,
      tooltip: `Inspect Git commit ${candidate.hash}`,
      terminal: context.terminal,
    }));
  }

  public async handleTerminalLink(link: CommitTerminalLink): Promise<void> {
    await this.inspect(link.hash, link.terminal.shellIntegration?.cwd);
  }
}
