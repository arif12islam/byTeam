/**
 * The status colors, in one place. A tone always means the same thing across
 * the app: success is present or done, warning is late or needs a look,
 * danger is absent or blocked, info is leave, off is a day off or inactive.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "off" | "neutral";

export const toneClasses: Record<Tone, { text: string; soft: string; solid: string; stroke: string }> = {
  success: { text: "text-success", soft: "bg-success-soft text-success", solid: "bg-success", stroke: "stroke-success" },
  warning: { text: "text-warning", soft: "bg-warning-soft text-warning", solid: "bg-warning", stroke: "stroke-warning" },
  danger: { text: "text-danger", soft: "bg-danger-soft text-danger", solid: "bg-danger", stroke: "stroke-danger" },
  info: { text: "text-info", soft: "bg-info-soft text-info", solid: "bg-info", stroke: "stroke-info" },
  off: { text: "text-off", soft: "bg-off-soft text-off", solid: "bg-off", stroke: "stroke-off" },
  neutral: { text: "text-foreground", soft: "bg-secondary text-secondary-foreground", solid: "bg-foreground", stroke: "stroke-foreground" },
};
