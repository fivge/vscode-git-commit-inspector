export interface HashCandidate {
  readonly hash: string;
  readonly startIndex: number;
  readonly length: number;
}

export function clampHashLength(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(40, Math.max(4, value))
    : 7;
}

export function scanCommitHashes(
  line: string,
  minimumLength: number,
): readonly HashCandidate[] {
  const minimum = clampHashLength(minimumLength);
  const expression = new RegExp(
    `(?<![0-9a-fA-F])[0-9a-fA-F]{${minimum},40}(?![0-9a-fA-F])`,
    "g",
  );
  return [...line.matchAll(expression)].map((match) => ({
    hash: match[0],
    startIndex: match.index ?? 0,
    length: match[0].length,
  }));
}
