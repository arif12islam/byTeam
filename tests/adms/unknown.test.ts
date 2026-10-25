import { describe, expect, it } from "vitest";

import { safePath, safeTable } from "@/lib/adms/unknown";

describe("safePath", () => {
  it("keeps the addresses firmware is known to call", () => {
    expect(safePath("/iclock/ping")).toBe("/iclock/ping");
    expect(safePath("/iclock/registry")).toBe("/iclock/registry");
    expect(safePath("/iclock/fdata")).toBe("/iclock/fdata");
  });

  it("never writes odd text to the log", () => {
    expect(safePath("/iclock/<script>")).toBe("an unusual path");
    expect(safePath("/iclock/a b")).toBe("an unusual path");
    expect(safePath(`/iclock/${"a".repeat(65)}`)).toBe("an unusual path");
    expect(safePath("/other/ping")).toBe("an unusual path");
  });
});

describe("safeTable", () => {
  it("keeps a plain table name and is null without one", () => {
    expect(safeTable("ATTPHOTO")).toBe("ATTPHOTO");
    expect(safeTable("options")).toBe("options");
    expect(safeTable(null)).toBeNull();
  });

  it("hides anything else", () => {
    expect(safeTable("ATT LOG")).toBe("an unusual table");
    expect(safeTable("x;drop")).toBe("an unusual table");
    expect(safeTable("")).toBe("an unusual table");
  });
});
