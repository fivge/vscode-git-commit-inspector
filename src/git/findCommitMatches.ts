import type { CommitInfo, RepositoryRef } from "./types";

export interface CommitResolver {
  resolveCommit(repository: RepositoryRef, ref: string): Promise<CommitInfo>;
}

export interface ResolvedCommit {
  readonly repository: RepositoryRef;
  readonly commit: CommitInfo;
}

export async function findCommitMatches(
  git: CommitResolver,
  repositories: readonly RepositoryRef[],
  ref: string,
  preferred?: RepositoryRef,
): Promise<readonly ResolvedCommit[]> {
  if (preferred) {
    const commit = await tryResolve(git, preferred, ref);
    if (commit) {
      return [{ repository: preferred, commit }];
    }
  }

  const candidates = repositories.filter(
    (repository) => repository.id !== preferred?.id,
  );
  return (
    await Promise.all(
      candidates.map(async (repository) => {
        const commit = await tryResolve(git, repository, ref);
        return commit ? { repository, commit } : undefined;
      }),
    )
  ).filter((match): match is ResolvedCommit => match !== undefined);
}

async function tryResolve(
  git: CommitResolver,
  repository: RepositoryRef,
  ref: string,
): Promise<CommitInfo | undefined> {
  try {
    return await git.resolveCommit(repository, ref);
  } catch {
    return undefined;
  }
}
