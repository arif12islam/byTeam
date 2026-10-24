import { describe, expect, it } from "vitest";

import { chunk } from "@/lib/adms/store";

describe("chunk", () => {
  it("splits a list into groups of at most the size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 500)).toEqual([]);
  });

  it("keeps everything in one group when the size is larger", () => {
    expect(chunk([1, 2], 500)).toEqual([[1, 2]]);
  });
});
