import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/roles";

// The real session and role code runs. Only the outside world is replaced: who is signed in, the
// database (which must never be touched by a refused request), and Next's own helpers.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ set: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

let signedIn: { role: string } | null = null;
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: { getSession: async () => (signedIn ? { user: { id: "user-1", name: "Tester", email: "t@example.test", role: signedIn.role } } : null) },
  }),
}));

const dbTouched = vi.fn();
vi.mock("@/db", () => ({
  getDb: () => {
    dbTouched();
    throw new Error("DATABASE TOUCHED");
  },
}));

const SRC = path.join(__dirname, "..", "..", "src");
const ADMIN = path.join(SRC, "app", "(admin)");

/** Every file under a folder whose name matches, found without any globbing library. */
function find(dir: string, match: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? find(full, match) : match(full) ? [full] : [];
  });
}

const actionFiles = find(path.join(SRC, "app"), (f) => /actions\.ts$/.test(f) && readFileSync(f, "utf8").includes('"use server"')).sort();

/** Sign in and sign out are open on purpose: they are how a session starts and ends. */
const OPEN_ACTION_FILES = [path.join(SRC, "app", "(admin)", "actions.ts"), path.join(SRC, "app", "(auth)", "login", "actions.ts")];

/** What only the owner may do. Everything else in the actions is for owner and HR. */
const OWNER_ONLY = ["finalizeRunAction", "unlockRunAction", "saveRuleSetAction", "loadSampleDataAction", "switchOffSampleAction"];

type Action = (...args: unknown[]) => Promise<unknown>;

// Vite finds every actions file, so a new one is covered without being listed here.
const actionModules = import.meta.glob<Record<string, unknown>>("../../src/app/**/actions.ts");
const namedActionModules = import.meta.glob<Record<string, unknown>>("../../src/app/**/*-actions.ts");

async function loadActions() {
  const loaded: { name: string; file: string; run: (formData: FormData) => Promise<unknown> }[] = [];
  const all = { ...actionModules, ...namedActionModules };
  for (const file of actionFiles.filter((f) => !OPEN_ACTION_FILES.includes(f))) {
    const key = Object.keys(all).find((k) => path.resolve(__dirname, k) === file);
    if (!key) throw new Error(`Test cannot find ${file}`);
    const exported = await all[key]();
    for (const [name, value] of Object.entries(exported)) {
      if (typeof value !== "function") continue;
      const fn = value as Action;
      // Form actions take (previous state, form data); a plain one takes only the form data.
      loaded.push({ name, file: path.relative(SRC, file), run: (formData) => (fn.length >= 2 ? fn({}, formData) : fn(formData)) });
    }
  }
  return loaded;
}

/** What happened when the action was called. */
async function attempt(run: (formData: FormData) => Promise<unknown>) {
  try {
    await run(new FormData());
    return "allowed" as const;
  } catch (error) {
    if (error instanceof ForbiddenError) return "forbidden" as const;
    if (error instanceof Error && error.message.startsWith("REDIRECT /login")) return "sent to login" as const;
    // Anything else got past the role check, and then stopped at the database or at bad input.
    return "allowed" as const;
  }
}

beforeEach(() => {
  signedIn = null;
  dbTouched.mockClear();
});

describe("every server action checks the role on the server", () => {
  it("finds the actions this test is meant to cover", async () => {
    const actions = await loadActions();
    const names = actions.map((a) => a.name);
    // Adding an action changes this number on purpose: whoever adds one has to check its role and the lists below.
    expect(names).toHaveLength(29);
    expect(names).toEqual(expect.arrayContaining(OWNER_ONLY));
    expect(new Set(names).size).toBe(names.length);
  });

  it("refuses someone who is not signed in, for every action, before any data is touched", async () => {
    for (const action of await loadActions()) {
      signedIn = null;
      expect(await attempt(action.run), `${action.name} with no session`).toBe("sent to login");
    }
    expect(dbTouched).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user whose role is not owner or HR, for every action", async () => {
    for (const role of ["intern", "", "OWNER", "admin"]) {
      for (const action of await loadActions()) {
        signedIn = { role };
        expect(await attempt(action.run), `${action.name} as "${role}"`).toBe("sent to login");
      }
    }
    expect(dbTouched).not.toHaveBeenCalled();
  });

  it("refuses HR for exactly the owner only actions, before any data is touched", async () => {
    signedIn = { role: "hr" };
    for (const action of await loadActions()) {
      dbTouched.mockClear();
      const result = await attempt(action.run);
      if (OWNER_ONLY.includes(action.name)) {
        expect(result, `${action.name} as HR`).toBe("forbidden");
        expect(dbTouched, `${action.name} touched the database for HR`).not.toHaveBeenCalled();
      } else {
        expect(result, `${action.name} as HR`).toBe("allowed");
      }
    }
  });

  it("lets the owner through every action", async () => {
    signedIn = { role: "owner" };
    for (const action of await loadActions()) {
      expect(await attempt(action.run), `${action.name} as owner`).toBe("allowed");
    }
  });

  it("what HR must not do: finalize, unlock, edit rules, and load or switch off sample data", async () => {
    signedIn = { role: "hr" };
    const actions = await loadActions();
    for (const name of OWNER_ONLY) {
      const action = actions.find((a) => a.name === name)!;
      await expect(action.run(new FormData()), name).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe("pages, downloads and the other routes are guarded in their own code", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  it("every admin page checks the role itself", () => {
    const pages = find(ADMIN, (f) => f.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThanOrEqual(14);
    for (const page of pages) {
      expect(read(page), path.relative(SRC, page)).toMatch(/requireRole\(\s*"owner"\s*,\s*"hr"\s*\)/);
    }
  });

  it("every download route checks sign in and role", () => {
    const routes = find(ADMIN, (f) => f.endsWith("route.ts"));
    expect(routes.map((r) => path.relative(ADMIN, r)).sort()).toEqual([
      "attendance/export/route.ts",
      "devices/agent-installer/route.ts",
      "payroll/export/route.ts",
      "payroll/payslip/route.ts",
      "reports/export/route.ts",
    ]);
    for (const route of routes) {
      const source = read(route);
      expect(source, path.relative(SRC, route)).toContain("getCurrentUser()");
      expect(source, path.relative(SRC, route)).toMatch(/canAct\(user\.role, \["owner", "hr"\]\)/);
      // The check comes before anything is read.
      if (source.includes("getDb()")) expect(source.indexOf("canAct("), path.relative(SRC, route)).toBeLessThan(source.indexOf("getDb()"));
    }
  });

  it("the nightly job needs the secret, and device routes need a registered serial number", () => {
    expect(read(path.join(SRC, "app", "api", "cron", "recalc", "route.ts"))).toContain("CRON_SECRET");
    for (const route of ["cdata", "getrequest", "devicecmd"]) {
      expect(read(path.join(SRC, "app", "iclock", route, "route.ts")), route).toContain("authenticateDevice(");
    }
  });
});
