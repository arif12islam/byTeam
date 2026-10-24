/**
 * The status colors, in one place. A tone always means the same thing across
 * the app: success is present or done, warning is late or needs a look,
 * danger is absent or blocked, info is leave, off is a day off or inactive.
 *
 * `text` and `soft` follow the light and dark theme and are safe to put words
 * on. `solid` and `stroke` are saturated fills for dots, bars and rings, and look
 * the same in both themes.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "off" | "neutral";

export const toneClasses: Record<Tone, { text: string; soft: string; solid: string; stroke: string}> = {
  success: {
    text: "text-success",
    soft: "bg-success-soft text-success",
    solid: "bg-emerald-500",
    stroke: "stroke-emerald-500",
  },
  warning: {
    text: "text-warning",
    soft: "bg-warning-soft text-warning",
    solid: "bg-amber-400",
    stroke: "stroke-amber-400",
  },
  danger: {
    text: "text-danger",
    soft: "bg-danger-soft text-danger",
    solid: "bg-rose-500",
    stroke: "stroke-rose-500",
  },
  info: {
    text: "text-info",
    soft: "bg-info-soft text-info",
    solid: "bg-sky-500",
    stroke: "stroke-sky-500",
  },
  off: {
    text: "text-off",
    soft: "bg-off-soft text-off",
    solid: "bg-slate-400",
    stroke: "stroke-slate-400",
  },
  neutral: {
    text: "text-foreground",
    soft: "bg-secondary text-secondary-foreground",
    solid: "bg-foreground",
    stroke: "stroke-foreground",
  },
};
