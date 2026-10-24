// Table definitions are added milestone by milestone, one file per group:
// setup.ts and auth.ts (M1), device.ts (M2), attendance.ts (M3), leave.ts (M4), payroll.ts (M5).
// Re-export each file here so the db client and drizzle-kit see every table.

export * from "./setup";
export * from "./auth";
export * from "./device";
export * from "./attendance";
