import { toneClasses, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type RingSegment = { value: number; tone: Tone; label: string };

/**
 * A donut chart in plain SVG, so it renders on the server with no script.
 * Segments are drawn in order, clockwise from the top. The children sit in
 * the middle. The accessible text lists every segment.
 */
export function Ring({
  segments,
  size = 148,
  thickness = 14,
  track = "stroke-secondary",
  className,
  children,
}: {
  segments: readonly RingSegment[];
  size?: number;
  thickness?: number;
  /** Stroke class of the empty part of the ring. */
  track?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(", ");

  let offset = 0;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={summary} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} className={track} />
        {total > 0
          ? segments.map((segment) => {
              const length = (Math.max(0, segment.value) / total) * circumference;
              if (length === 0) return null;
              const circle = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  className={toneClasses[segment.tone].stroke}
                />
              );
              offset += length;
              return circle;
            })
          : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
