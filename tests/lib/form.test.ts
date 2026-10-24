import { describe, expect, it } from "vitest";

import { fieldValue, formError, formValues } from "@/lib/form";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("formValues", () => {
  it("keeps text fields and drops files", () => {
    const fd = formData({ name: "Rahim", code: "1001" });
    fd.set("upload", new File(["x"], "x.txt"));
    expect(formValues(fd)).toEqual({ name: "Rahim", code: "1001" });
  });
});

describe("formError", () => {
  it("carries the message and the submitted values", () => {
    expect(formError(formData({ name: "Rahim" }), "Nope")).toEqual({ error: "Nope", values: { name: "Rahim" } });
  });
});

describe("fieldValue", () => {
  it("prefers the submitted value, even when it is empty", () => {
    expect(fieldValue({ values: { name: "" } }, "name", "Saved")).toBe("");
    expect(fieldValue({ values: { name: "New" } }, "name", "Saved")).toBe("New");
  });

  it("falls back to the saved value, then to empty", () => {
    expect(fieldValue({}, "name", "Saved")).toBe("Saved");
    expect(fieldValue({}, "grace", 10)).toBe("10");
    expect(fieldValue({}, "name", null)).toBe("");
    expect(fieldValue({}, "name")).toBe("");
  });
});
