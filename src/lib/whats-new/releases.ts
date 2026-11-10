/**
 * What's new in byTeam. After every update people will notice, add a release at
 * the TOP of RELEASES: the first time someone opens the app after it, they get a
 * short tour of it, one step per item, with a picture of the change and how it
 * works. Everyone sees each release once. The newest release is the first one.
 *
 * Keep an item to one change a person can see or use. `visual` names a picture
 * in src/components/whats-new/visuals.tsx; `steps` are the 2 or 3 things to do,
 * numbered to match the markers in the picture.
 */

export const VISUALS = ["app", "login", "late", "departments", "leavingPunch", "export", "delete", "holidays", "notifications", "insights"] as const;
export type VisualKey = (typeof VISUALS)[number];

export type ReleaseItem = {
  id: string;
  title: string;
  /** One or two sentences on what changed and why it helps. */
  body: string;
  visual: VisualKey;
  /** What to do, in order. At most four, matching the numbered markers in the picture. */
  steps: string[];
  /** Where to try it. */
  href?: string;
  tryLabel?: string;
};

export type Release = {
  /** Never changes once released: it is what a person's "seen" mark is compared with. */
  id: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  summary: string;
  items: ReleaseItem[];
};

export const RELEASES: Release[] = [
  {
    id: "2026-11-e",
    title: "Insights shows the month at a glance",
    date: "2026-11-10",
    summary: "Numbers, charts and lists on top of the facts, so you see how the month is going in one look.",
    items: [
      {
        id: "insights-glance",
        title: "The month at a glance",
        body: "Insights now opens with attendance, lates, absences and who is in today, compared with the same days last month. Below are the facts worth a look with a person and a clear next step, a chart of every day, lates by weekday, who is most on time, who needs a look, leave running low, the device, and net pay by month.",
        visual: "insights",
        steps: ["Open Insights and read the four numbers at the top.", "Tap a fact to open the person's calendar or the right page.", "Open Show as table under a chart for the numbers."],
        href: "/insights",
        tryLabel: "Open Insights",
      },
    ],
  },
  {
    id: "2026-11-d",
    title: "Back takes you where you were",
    date: "2026-11-09",
    summary: "Go back from a day or a person and the list is exactly where you left it.",
    items: [
      {
        id: "remember-place",
        title: "Pages remember your place",
        body: "Scroll down a long list, open someone or a day, then go back: the page is where you left it, with the same month and filters. It works with the browser's back button, the Back links on each page, and when you reload.",
        visual: "app",
        steps: ["Scroll down on Attendance and open a day.", "Tap Back to attendance, or your phone's back.", "You are at the same spot in the list."],
        href: "/attendance",
        tryLabel: "Open Attendance",
      },
    ],
  },
  {
    id: "2026-11-c",
    title: "Smarter, more useful Insights",
    date: "2026-11-09",
    summary: "Insights now open the person's attendance calendar, and notice more.",
    items: [
      {
        id: "insights-smarter",
        title: "Insights that open the right page",
        body: "A fact about a person now opens their attendance calendar for the month, or the exact day to fix, instead of their profile. Insights also notice more: someone absent for days in a row, late every day lately, late mostly on one weekday, lates getting longer, and good news when someone is back on track.",
        visual: "insights",
        steps: ["Open Insights, or look at Worth a look on Today.", "Tap a fact about a person to see their month.", "Tap a day to see the punches and correct it."],
        href: "/insights",
        tryLabel: "Open Insights",
      },
    ],
  },
  {
    id: "2026-11-b",
    title: "Holidays, alerts and insights",
    date: "2026-11-09",
    summary: "Load a year of holidays in one go, get alerts on your phone, and see what is worth a look.",
    items: [
      {
        id: "holiday-import",
        title: "Import public holidays",
        body: "Load a year of Bangladesh holidays from Google's calendar, or paste your own list. You see every date first and tick only what is a day off for your office.",
        visual: "holidays",
        steps: ["Open Settings, Holidays tab, Import public holidays.", "Choose Google's calendar or paste a list, then tap Show the list.", "Untick any date that is not a day off, then tap Add."],
        href: "/settings?tab=holidays",
        tryLabel: "Open Settings",
      },
      {
        id: "notifications",
        title: "Alerts on your phone",
        body: "Get a notification when the fingerprint device or the office laptop goes quiet, a morning summary of who is in, and a heads up when an unknown code punches. They work even when byTeam is closed.",
        visual: "notifications",
        steps: ["On an iPhone, add byTeam to the Home Screen first.", "Open Settings, Notifications tab and turn them on for this device.", "Choose what you want, then tap Send a test."],
        href: "/settings?tab=notifications",
        tryLabel: "Open Settings",
      },
      {
        id: "insights",
        title: "Insights: what is worth a look",
        body: "Short facts worked out from what byTeam already knows: lates going up, someone one late from a pay cut, forgotten leaving punches, a quiet device. The top few show on Today.",
        visual: "insights",
        steps: ["Look at Worth a look on Today.", "Tap a fact to go to the person or screen it is about.", "Open Insights for the full list."],
        href: "/insights",
        tryLabel: "Open Insights",
      },
    ],
  },
  {
    id: "2026-11",
    title: "November update",
    date: "2026-11-09",
    summary: "A new look, an app for your phone, and a lot of small things made easier.",
    items: [
      {
        id: "app",
        title: "Use byTeam like an app",
        body: "Add byTeam to your phone's home screen and it opens full screen, with the new logo as its icon, and no browser bars.",
        visual: "app",
        steps: ["Open byTeam in Safari (iPhone) or Chrome (Android).", "Tap Share, then Add to Home Screen.", "Open it from the new icon."],
      },
      {
        id: "login",
        title: "Change your own login",
        body: "Set your name, email and password yourself. Your name shows in the menu and in the audit log.",
        visual: "login",
        steps: ["Open Settings and find Your login.", "Change the name, email or password.", "Enter your current password and save."],
        href: "/settings?tab=login",
        tryLabel: "Open Settings",
      },
      {
        id: "late",
        title: "Late time in hours and minutes",
        body: "A late of 125 minutes now reads 2 h 5 min, everywhere. Excel and CSV exports also get a Late (h:mm) column.",
        visual: "late",
        steps: ["Open Attendance or Today.", "Look at a late day: the badge shows hours and minutes."],
        href: "/attendance",
        tryLabel: "Open Attendance",
      },
      {
        id: "departments",
        title: "Choose a department from a list",
        body: "No more typing the same department differently. Add departments once in Settings, then pick them for each employee. Renaming one renames it for everyone in it.",
        visual: "departments",
        steps: ["Settings, Departments: add or rename them.", "Open an employee and pick the department.", "Missing one? Use Manage departments."],
        href: "/settings?tab=company#departments",
        tryLabel: "Manage departments",
      },
      {
        id: "leaving-punch",
        title: "Turn the leaving punch on or off",
        body: "If your office only punches in, switch the leaving punch off. Then only the first punch counts, and there are no missing leaving punch warnings.",
        visual: "leavingPunch",
        steps: ["Open Settings, Company.", "Untick Use the leaving punch.", "Save. It applies from today."],
        href: "/settings",
        tryLabel: "Open Settings",
      },
      {
        id: "export",
        title: "Export attendance your way",
        body: "Download attendance as Excel, PDF or CSV, and filter it by department, one person, or only people who were late, absent or on leave.",
        visual: "export",
        steps: ["Open Attendance and Export attendance.", "Pick the format and the filters.", "Tap Download."],
        href: "/attendance",
        tryLabel: "Open Attendance",
      },
      {
        id: "edit-delete",
        title: "Edit or delete what you add",
        body: "Shifts, pay rules and leave types can be deleted when nothing depends on them. Holidays and outages can be edited. If something is in use, byTeam tells you why and what to do instead.",
        visual: "delete",
        steps: ["Open a shift, pay rule or leave type.", "Tap Delete and confirm.", "If it is in use, move the people first."],
        href: "/shifts",
        tryLabel: "Open Shifts",
      },
    ],
  },
];

export const LATEST_RELEASE: Release = RELEASES[0];

/**
 * The release to show someone: the newest one when they have not seen it, else
 * nothing. An id this list does not know (an older or removed release) counts as
 * not seen, so nobody is left out of a release by mistake.
 */
export function unseenRelease(lastSeenId: string | null | undefined): Release | null {
  return lastSeenId === LATEST_RELEASE.id ? null : LATEST_RELEASE;
}
