import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { salaryStructures } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isValidMonth } from "@/lib/time";

import {
  MAX_CENTS,
  centsToMoney,
  hundredthsToPercent,
  parseMoneyToCents,
  parsePercentToHundredths,
  percentOfCents,
} from "./money";

type Db = ReturnType<typeof getDb>;

const percent = (label: string) =>
  z.string().transform((value, ctx) => {
    const hundredths = parsePercentToHundredths(value);
    if (hundredths === null) {
      ctx.addIssue({ code: "custom", message: `${label} must be a number from 0 to 100, like 60 or 62.5.` });
      return z.NEVER;
    }
    return hundredths;
  });

export const salaryInputSchema = z
  .object({
    gross: z.string().transform((value, ctx) => {
      const cents = parseMoneyToCents(value);
      if (cents === null || cents <= 0 || cents > MAX_CENTS) {
        ctx.addIssue({ code: "custom", message: "Enter the gross salary in taka, like 30000 or 30000.50." });
        return z.NEVER;
      }
      return cents;
    }),
    basicPct: percent("Basic"),
    housePct: percent("House rent"),
    medicalPct: percent("Medical"),
    conveyancePct: percent("Conveyance"),
    effectiveMonth: z.string().refine(isValidMonth, "Choose the month this salary starts."),
  })
  .refine((s) => s.basicPct + s.housePct + s.medicalPct + s.conveyancePct <= 10_000, {
    path: ["basicPct"],
    message: "The percentages add up to more than 100.",
  })
  .transform((s) => ({
    gross: centsToMoney(s.gross),
    basicPct: hundredthsToPercent(s.basicPct),
    housePct: hundredthsToPercent(s.housePct),
    medicalPct: hundredthsToPercent(s.medicalPct),
    conveyancePct: hundredthsToPercent(s.conveyancePct),
    effectiveFrom: `${s.effectiveMonth}-01`,
  }));

export type SalaryInput = z.input<typeof salaryInputSchema>;

export type SalaryStructure = {
  id: string;
  employeeId: string;
  gross: string;
  basicPct: string;
  housePct: string;
  medicalPct: string;
  conveyancePct: string;
  /** First day of the month it starts, YYYY-MM-01. */
  effectiveFrom: string;
};

/**
 * Gross split into its parts, as amounts. `other` is whatever the percentages
 * leave over. Each part is the rounded running total minus the one before, so
 * the parts always add up to the rounded total and never go over gross.
 */
export function salaryBreakdown(s: Pick<SalaryStructure, "gross" | "basicPct" | "housePct" | "medicalPct" | "conveyancePct">) {
  const gross = parseMoneyToCents(s.gross) ?? 0;
  const pcts = [s.basicPct, s.housePct, s.medicalPct, s.conveyancePct].map((p) => parsePercentToHundredths(p) ?? 0);

  let runningPct = 0;
  let runningCents = 0;
  const parts = pcts.map((pct) => {
    runningPct += pct;
    const cumulative = percentOfCents(gross, runningPct);
    const part = cumulative - runningCents;
    runningCents = cumulative;
    return part;
  });

  const [basic, house, medical, conveyance] = parts;
  return {
    basic: centsToMoney(basic),
    house: centsToMoney(house),
    medical: centsToMoney(medical),
    conveyance: centsToMoney(conveyance),
    other: centsToMoney(gross - runningCents),
  };
}

/** The structure in force for a month (YYYY-MM): the latest one starting on or before it. */
export function structureForMonth<T extends { effectiveFrom: string }>(list: T[], month: string): T | null {
  const limit = `${month}-01`;
  let best: T | null = null;
  for (const item of list) {
    if (item.effectiveFrom <= limit && (best === null || item.effectiveFrom > best.effectiveFrom)) best = item;
  }
  return best;
}

export async function listSalaryStructures(db: Db, employeeId: string): Promise<SalaryStructure[]> {
  return db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, employeeId))
    .orderBy(desc(salaryStructures.effectiveFrom))
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        gross: row.gross,
        basicPct: row.basicPct,
        housePct: row.housePct,
        medicalPct: row.medicalPct,
        conveyancePct: row.conveyancePct,
        effectiveFrom: row.effectiveFrom,
      })),
    );
}

const FIELDS = ["gross", "basicPct", "housePct", "medicalPct", "conveyancePct"] as const;

/**
 * Adds a salary structure from a month on. If one already starts in that
 * month it is updated instead, so a wrong entry can be corrected. Saving the
 * same numbers that already apply to that month changes nothing. Throws a
 * foreign key violation when the employee does not exist.
 */
export async function saveSalaryStructure(db: Db, employeeId: string, input: SalaryInput, actorId: string) {
  const data = salaryInputSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(salaryStructures)
      .where(and(eq(salaryStructures.employeeId, employeeId), eq(salaryStructures.effectiveFrom, data.effectiveFrom)));

    if (before) {
      if (FIELDS.every((key) => before[key] === data[key])) return { changed: false as const, created: false };

      const [after] = await tx
        .update(salaryStructures)
        .set(data)
        .where(eq(salaryStructures.id, before.id))
        .returning();
      await audit(tx, {
        actorId,
        action: "salary.update",
        entity: "salary_structure",
        entityId: after.id,
        before,
        after,
      });
      return { changed: true as const, created: false };
    }

    // A new version that matches the one already in force for that month adds nothing.
    const [earlier] = await tx
      .select()
      .from(salaryStructures)
      .where(and(eq(salaryStructures.employeeId, employeeId), lt(salaryStructures.effectiveFrom, data.effectiveFrom)))
      .orderBy(desc(salaryStructures.effectiveFrom))
      .limit(1);
    if (earlier && FIELDS.every((key) => earlier[key] === data[key])) return { changed: false as const, created: false };

    const [after] = await tx.insert(salaryStructures).values({ employeeId, ...data }).returning();
    await audit(tx, {
      actorId,
      action: "salary.create",
      entity: "salary_structure",
      entityId: after.id,
      after,
    });
    return { changed: true as const, created: true };
  });
}
