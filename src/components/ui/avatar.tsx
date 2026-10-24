import { accentClasses, accentCycle } from "@/components/accent";
import { cn } from "@/lib/utils";

const palette = accentCycle.map((name) => accentClasses[name].solid);

/** Up to two initials from a name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** The same name always gets the same color. */
function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/** A round chip with the person's initials, colored by their name. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
        colorFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
