import { describe, expect, test } from "bun:test";
import { clampHashLength, scanCommitHashes } from "../../src/terminal/hashScanner";

describe("scanCommitHashes", () => {
  test("finds bounded abbreviated and full hashes", () => {
    expect(scanCommitHashes("47db09b feat 0f89466f", 7)).toEqual([
      { hash: "47db09b", startIndex: 0, length: 7 },
      { hash: "0f89466f", startIndex: 13, length: 8 },
    ]);
  });

  test("does not take a substring from a longer hexadecimal token", () => {
    expect(scanCommitHashes("a".repeat(41), 7)).toEqual([]);
  });

  test("honors and clamps the configured minimum", () => {
    expect(clampHashLength(2)).toBe(4);
    expect(clampHashLength(50)).toBe(40);
    expect(clampHashLength("7")).toBe(7);
    expect(scanCommitHashes("abcd abcde", 4)).toHaveLength(2);
  });
});
