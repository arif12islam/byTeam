import { describe, expect, it } from "vitest";

import {
  byEmpCode,
  employeeDetailsSchema,
  empCodeSchema,
  newEmployeeSchema,
} from "@/lib/employees/employees";

const shiftId = "3f0c1f4e-8f7a-4c52-9a43-0b6a4c1e2d11";
const valid = {
  empCode: "1001",
  name: "Rahim Uddin",
  department: "Sales",
  designation: "Executive",
  joinDate: "2026-01-05",
  exitDate: "",
  shiftId,
};

describe("empCodeSchema", () => {
  it("keeps leading zeros", () => {
    expect(empCodeSchema.parse(" 0042 ")).toBe("0042");
  });

  it("rejects letters, symbols, empty and very long codes", () => {
    for (const bad of ["", "A12", "12-3", "1 2", "1".repeat(25)]) {
      expect(empCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("employeeDetailsSchema", () => {
  it("turns empty optional fields into null", () => {
    const parsed = employeeDetailsSchema.parse({ ...valid, department: "  ", designation: "", exitDate: "" });
    expect(parsed).toMatchObject({ department: null, designation: null, exitDate: null });
  });

  it("accepts fields missing entirely", () => {
    const { department, designation, exitDate, ...rest } = valid;
    void department; void designation; void exitDate;
    expect(employeeDetailsSchema.parse(rest)).toMatchObject({ department: null, designation: null, exitDate: null });
  });

  it("trims text", () => {
    expect(employeeDetailsSchema.parse({ ...valid, name: "  Rahim ", department: " Sales " })).toMatchObject({
      name: "Rahim",
      department: "Sales",
    });
  });

  it("requires a name, a real join date and a shift", () => {
    expect(employeeDetailsSchema.safeParse({ ...valid, name: " " }).success).toBe(false);
    expect(employeeDetailsSchema.safeParse({ ...valid, joinDate: "" }).success).toBe(false);
    expect(employeeDetailsSchema.safeParse({ ...valid, joinDate: "2026-02-30" }).success).toBe(false);
    expect(employeeDetailsSchema.safeParse({ ...valid, shiftId: "" }).success).toBe(false);
    expect(employeeDetailsSchema.safeParse({ ...valid, shiftId: "not-a-uuid" }).success).toBe(false);
  });

  it("allows an exit date on or after the join date only", () => {
    expect(employeeDetailsSchema.safeParse({ ...valid, exitDate: "2026-01-05" }).success).toBe(true);
    expect(employeeDetailsSchema.safeParse({ ...valid, exitDate: "2026-06-30" }).success).toBe(true);
    expect(employeeDetailsSchema.safeParse({ ...valid, exitDate: "2026-01-04" }).success).toBe(false);
    expect(employeeDetailsSchema.safeParse({ ...valid, exitDate: "2026-13-01" }).success).toBe(false);
  });
});

describe("newEmployeeSchema", () => {
  it("needs a valid code as well as the details", () => {
    expect(newEmployeeSchema.safeParse(valid).success).toBe(true);
    expect(newEmployeeSchema.safeParse({ ...valid, empCode: "x" }).success).toBe(false);
  });
});

describe("byEmpCode", () => {
  it("sorts numerically, not alphabetically", () => {
    const sorted = [{ empCode: "10" }, { empCode: "2" }, { empCode: "1001" }, { empCode: "09" }].sort(byEmpCode);
    expect(sorted.map((e) => e.empCode)).toEqual(["2", "09", "10", "1001"]);
  });
});
