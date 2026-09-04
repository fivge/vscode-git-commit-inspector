import * as vscode from "vscode";

export const REVISION_SCHEME = "git-commit-inspect";

interface RevisionPayload {
  readonly repositoryId: string;
  readonly ref?: string;
  readonly empty?: true;
}

export interface RevisionDescriptor {
  readonly repositoryId: string;
  readonly ref: string | undefined;
  readonly filePath: string;
  readonly empty: boolean;
}

export function createRevisionUri(
  repositoryId: string,
  ref: string | undefined,
  filePath: string,
): vscode.Uri {
  const payload: RevisionPayload = ref
    ? { repositoryId, ref }
    : { repositoryId, empty: true };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return vscode.Uri.from({
    scheme: REVISION_SCHEME,
    authority: "revision",
    path: `/${filePath.replace(/^\/+/, "")}`,
    query: `data=${encoded}`,
  });
}

export function decodeRevisionUri(uri: vscode.Uri): RevisionDescriptor {
  if (uri.scheme !== REVISION_SCHEME || uri.authority !== "revision") {
    throw new Error("Invalid Git Commit Inspector revision URI.");
  }
  const encoded = new URLSearchParams(uri.query).get("data");
  if (!encoded) {
    throw new Error("Revision URI is missing its payload.");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as RevisionPayload;
  if (!payload.repositoryId || (!payload.ref && !payload.empty)) {
    throw new Error("Revision URI payload is invalid.");
  }
  return {
    repositoryId: payload.repositoryId,
    ref: payload.ref,
    filePath: uri.path.replace(/^\//, ""),
    empty: payload.empty === true,
  };
}
