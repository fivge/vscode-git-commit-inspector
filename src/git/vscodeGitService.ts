import * as path from "node:path";
import * as vscode from "vscode";
import {
  type ChangeStatus,
  type CommitChange,
  type CommitInfo,
  type GitService,
  InspectorError,
  type RepositoryRef,
} from "./types";
import {
  GitStatus,
  type GitExtensionHandle,
  type VsCodeGitApi,
  type VsCodeGitDiffChange,
  type VsCodeGitExtension,
  type VsCodeGitRepository,
} from "./vscodeGit";

const EMPTY_TREE_SHA1 = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export class VsCodeGitService implements GitService {
  private api: VsCodeGitApi | undefined;

  public async getRepositories(): Promise<readonly RepositoryRef[]> {
    const api = await this.getApi();
    return api.repositories.map(toRepositoryRef);
  }

  public async getRepositoryForUri(
    uri: vscode.Uri,
  ): Promise<RepositoryRef | undefined> {
    const repository = (await this.getApi()).getRepository(uri);
    return repository ? toRepositoryRef(repository) : undefined;
  }

  public async resolveCommit(
    repository: RepositoryRef,
    ref: string,
  ): Promise<CommitInfo> {
    const nativeRepository = await this.getNativeRepository(repository);
    const commit = await nativeRepository.getCommit(ref);
    return {
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      message: commit.message,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authorDate: commit.authorDate,
      commitDate: commit.commitDate,
      parents: [...commit.parents],
    };
  }

  public async getCommitChanges(
    repository: RepositoryRef,
    commit: CommitInfo,
  ): Promise<readonly CommitChange[]> {
    const nativeRepository = await this.getNativeRepository(repository);
    const base = commit.parents[0] ?? EMPTY_TREE_SHA1;
    const changes = await nativeRepository.diffBetweenWithStats(base, commit.hash);
    return changes.map((change) => normalizeChange(repository, change));
  }

  public async getFileAtRevision(
    repository: RepositoryRef,
    ref: string,
    filePath: string,
  ): Promise<string> {
    try {
      return await (await this.getNativeRepository(repository)).show(ref, filePath);
    } catch {
      throw new InspectorError(
        `Unable to read ${filePath} at revision ${ref.slice(0, 7)}.`,
      );
    }
  }

  public async isBinaryFile(
    repository: RepositoryRef,
    ref: string,
    filePath: string,
  ): Promise<boolean> {
    const nativeRepository = await this.getNativeRepository(repository);
    const details = await nativeRepository.getObjectDetails(ref, filePath);
    const type = await nativeRepository.detectObjectType(details.object);
    if (type.encoding?.toLowerCase() === "binary") {
      return true;
    }

    return !isTextMimeType(type.mimetype);
  }

  private async getApi(): Promise<VsCodeGitApi> {
    if (this.api) {
      await waitForInitialized(this.api);
      return this.api;
    }

    const extension = vscode.extensions.getExtension<VsCodeGitExtension>("vscode.git") as
      | GitExtensionHandle
      | undefined;
    if (!extension) {
      throw new InspectorError("VS Code Git extension is unavailable.");
    }

    const exports = extension.isActive ? extension.exports : await extension.activate();
    if (!exports.enabled) {
      throw new InspectorError("VS Code Git extension is disabled.");
    }

    this.api = exports.getAPI(1);
    await waitForInitialized(this.api);
    return this.api;
  }

  private async getNativeRepository(
    repository: RepositoryRef,
  ): Promise<VsCodeGitRepository> {
    const repositories = (await this.getApi()).repositories;
    const nativeRepository = repositories.find(
      (candidate) => candidate.rootUri.toString() === repository.id,
    );
    if (!nativeRepository) {
      throw new InspectorError(
        `Git repository is no longer available: ${repository.rootUri.toString(true)}`,
      );
    }
    return nativeRepository;
  }
}

function toRepositoryRef(repository: VsCodeGitRepository): RepositoryRef {
  return {
    id: repository.rootUri.toString(),
    rootUri: repository.rootUri,
  };
}

function normalizeChange(
  repository: RepositoryRef,
  change: VsCodeGitDiffChange,
): CommitChange {
  const status = mapStatus(change.status);
  const newUri = change.renameUri ?? change.uri;
  return {
    status,
    path: relativeGitPath(repository.rootUri, newUri),
    oldPath:
      status === "renamed" || status === "copied"
        ? relativeGitPath(repository.rootUri, change.originalUri)
        : undefined,
    additions: change.insertions,
    deletions: change.deletions,
  };
}

function relativeGitPath(root: vscode.Uri, file: vscode.Uri): string {
  return path.posix.relative(root.path, file.path);
}

function mapStatus(status: GitStatus): ChangeStatus {
  switch (status) {
    case GitStatus.IndexModified:
    case GitStatus.Modified:
    case GitStatus.TypeChanged:
      return "modified";
    case GitStatus.IndexAdded:
    case GitStatus.Untracked:
      return "added";
    case GitStatus.IndexDeleted:
    case GitStatus.Deleted:
      return "deleted";
    case GitStatus.IndexRenamed:
      return "renamed";
    case GitStatus.IndexCopied:
      return "copied";
    default:
      return "unknown";
  }
}

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    /(?:empty|json|javascript|typescript|xml|svg|yaml|toml|shellscript|x-sh|sql)/i.test(
      mimeType,
    )
  );
}

async function waitForInitialized(api: VsCodeGitApi): Promise<void> {
  if (api.state === "initialized") {
    return;
  }
  await new Promise<void>((resolve) => {
    const disposable = api.onDidChangeState((state) => {
      if (state === "initialized") {
        disposable.dispose();
        resolve();
      }
    });
  });
}
