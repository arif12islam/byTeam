/**
 * Accent colors give each part of the app its own identity: the menu icons,
 * the heading tile and the chips on cards. They are only decoration. What a
 * day or a person's status means is always carried by the tones in `tone.ts`.
 */
export type Accent = "green" | "indigo" | "violet" | "pink" | "orange" | "teal" | "sky" | "lime" | "slate";

type AccentClasses = {
  /** A solid color with a contrasting icon on it: white in light mode, dark in dark mode. */
  solid: string;
  /** A soft background with the accent as the icon color. */
  soft: string;
  /** The accent as a text or icon color. */
  text: string;
  /** A glow behind a heading tile. */
  glow: string;
  /** A soft blurred shape for the corner of a dark hero panel. */
  blob: string;
};

export const accentClasses: Record<Accent, AccentClasses> = {
  green: { solid: "bg-forest-active text-white", soft: "bg-accent text-accent-foreground", text: "text-primary", glow: "shadow-[0_6px_18px_-4px_rgb(30_107_82/0.6)]", blob: "bg-forest-active/40" },
  indigo: { solid: "bg-acc-indigo text-acc-on", soft: "bg-acc-indigo-soft text-acc-indigo", text: "text-acc-indigo", glow: "shadow-[0_6px_18px_-4px_rgb(79_70_229/0.55)]", blob: "bg-acc-indigo/35" },
  violet: { solid: "bg-acc-violet text-acc-on", soft: "bg-acc-violet-soft text-acc-violet", text: "text-acc-violet", glow: "shadow-[0_6px_18px_-4px_rgb(124_58_237/0.55)]", blob: "bg-acc-violet/35" },
  pink: { solid: "bg-acc-pink text-acc-on", soft: "bg-acc-pink-soft text-acc-pink", text: "text-acc-pink", glow: "shadow-[0_6px_18px_-4px_rgb(219_39_119/0.5)]", blob: "bg-acc-pink/30" },
  orange: { solid: "bg-acc-orange text-acc-on", soft: "bg-acc-orange-soft text-acc-orange", text: "text-acc-orange", glow: "shadow-[0_6px_18px_-4px_rgb(217_102_10/0.55)]", blob: "bg-acc-orange/35" },
  teal: { solid: "bg-acc-teal text-acc-on", soft: "bg-acc-teal-soft text-acc-teal", text: "text-acc-teal", glow: "shadow-[0_6px_18px_-4px_rgb(13_138_127/0.55)]", blob: "bg-acc-teal/35" },
  sky: { solid: "bg-acc-sky text-acc-on", soft: "bg-acc-sky-soft text-acc-sky", text: "text-acc-sky", glow: "shadow-[0_6px_18px_-4px_rgb(2_132_199/0.55)]", blob: "bg-acc-sky/35" },
  lime: { solid: "bg-acc-lime text-acc-on", soft: "bg-acc-lime-soft text-acc-lime", text: "text-acc-lime", glow: "shadow-[0_6px_18px_-4px_rgb(77_124_15/0.55)]", blob: "bg-acc-lime/35" },
  slate: { solid: "bg-acc-slate text-acc-on", soft: "bg-acc-slate-soft text-acc-slate", text: "text-acc-slate", glow: "shadow-[0_6px_18px_-4px_rgb(71_85_105/0.5)]", blob: "bg-acc-slate/35" },
};

/** The colors people and charts cycle through, so neighbours differ. */
export const accentCycle: Accent[] = ["indigo", "pink", "teal", "orange", "violet", "sky", "lime", "slate"];
