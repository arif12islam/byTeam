import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const styles = {
  danger: "border-danger/30 bg-danger-soft",
  warning: "border-warning/30 bg-warning-soft",
  info: "border-info/30 bg-info-soft",
} as const;

const iconStyles = { danger: "text-danger", warning: "text-warning", info: "text-info" } as const;

/** A message banner above the content it is about. Text stays in the normal color so it is easy to read. */
export function Alert({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: keyof typeof styles;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", styles[tone], className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconStyles[tone])} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
