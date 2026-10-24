/**
 * Accent colors give each part of the app its own identity: the menu icons,
 * the page banner, the chips on cards and the avatars. They are decoration.
 * What a day or a person's status means is always carried by the tones in
 * `ui/tone.ts`.
 *
 * Everything here that is a gradient is saturated and the same in light and
 * dark mode, with white text on it. `soft` and `text` follow the theme.
 */
export type Accent = "green" | "indigo" | "violet" | "pink" | "orange" | "teal" | "sky" | "lime" | "slate";

type AccentClasses = {
  /** A small saturated gradient with a white icon, for menu icons, chips and avatars. */
  solid: string;
  /** A big gradient with white text, for a page banner or a hero panel. */
  banner: string;
  /** A soft background with the accent as the icon color. Follows the theme. */
  soft: string;
  /** The accent as a text or icon color. Follows the theme. */
  text: string;
  /** A soft blurred shape for the corner of a banner. */
  blob: string;
  /** A flat fill, for chart bars. */
  fill: string;
};

export const accentClasses: Record<Accent, AccentClasses> = {
  green: {
    solid: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
    banner: "bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white",
    soft: "bg-accent text-accent-foreground",
    text: "text-primary",
    blob: "bg-lime-300/30",
    fill: "bg-emerald-500",
  },
  indigo: {
    solid: "bg-gradient-to-br from-indigo-500 to-violet-600 text-white",
    banner: "bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 text-white",
    soft: "bg-acc-indigo-soft text-acc-indigo",
    text: "text-acc-indigo",
    blob: "bg-sky-300/30",
    fill: "bg-indigo-500",
  },
  violet: {
    solid: "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white",
    banner: "bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700 text-white",
    soft: "bg-acc-violet-soft text-acc-violet",
    text: "text-acc-violet",
    blob: "bg-pink-300/30",
    fill: "bg-violet-500",
  },
  pink: {
    solid: "bg-gradient-to-br from-pink-500 to-rose-500 text-white",
    banner: "bg-gradient-to-br from-pink-600 via-rose-600 to-orange-600 text-white",
    soft: "bg-acc-pink-soft text-acc-pink",
    text: "text-acc-pink",
    blob: "bg-amber-300/30",
    fill: "bg-pink-500",
  },
  orange: {
    solid: "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
    banner: "bg-gradient-to-br from-orange-600 via-rose-500 to-pink-600 text-white",
    soft: "bg-acc-orange-soft text-acc-orange",
    text: "text-acc-orange",
    blob: "bg-yellow-300/35",
    fill: "bg-orange-500",
  },
  teal: {
    solid: "bg-gradient-to-br from-teal-500 to-cyan-600 text-white",
    banner: "bg-gradient-to-br from-teal-600 via-cyan-600 to-sky-700 text-white",
    soft: "bg-acc-teal-soft text-acc-teal",
    text: "text-acc-teal",
    blob: "bg-emerald-300/30",
    fill: "bg-teal-500",
  },
  sky: {
    solid: "bg-gradient-to-br from-sky-500 to-blue-600 text-white",
    banner: "bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700 text-white",
    soft: "bg-acc-sky-soft text-acc-sky",
    text: "text-acc-sky",
    blob: "bg-cyan-300/30",
    fill: "bg-sky-500",
  },
  lime: {
    solid: "bg-gradient-to-br from-lime-500 to-emerald-600 text-white",
    banner: "bg-gradient-to-br from-lime-600 via-green-600 to-emerald-700 text-white",
    soft: "bg-acc-lime-soft text-acc-lime",
    text: "text-acc-lime",
    blob: "bg-yellow-200/30",
    fill: "bg-lime-500",
  },
  slate: {
    solid: "bg-gradient-to-br from-slate-500 to-slate-700 text-white",
    banner: "bg-gradient-to-br from-slate-700 via-slate-800 to-indigo-900 text-white",
    soft: "bg-acc-slate-soft text-acc-slate",
    text: "text-acc-slate",
    blob: "bg-indigo-300/25",
    fill: "bg-slate-500",
  },
};

/** The colors people and charts cycle through, so neighbours differ. */
export const accentCycle: Accent[] = ["indigo", "pink", "teal", "orange", "violet", "sky", "lime", "green"];
