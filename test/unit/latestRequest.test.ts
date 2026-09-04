import { describe, expect, test } from "bun:test";
import { LatestRequest } from "../../src/commit/latestRequest";

describe("LatestRequest", () => {
  test("only accepts the newest request", () => {
    const requests = new LatestRequest();
    const first = requests.next();
    const second = requests.next();
    expect(requests.isCurrent(first)).toBeFalse();
    expect(requests.isCurrent(second)).toBeTrue();
  });

  test("invalidates an in-flight request when clearing", () => {
    const requests = new LatestRequest();
    const request = requests.next();
    requests.invalidate();
    expect(requests.isCurrent(request)).toBeFalse();
  });
});
