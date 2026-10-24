type ComingSoonProps = {
  milestone: string;
  points: string[];
};

/** Placeholder body for screens that are built in a later milestone. */
export function ComingSoon({ milestone, points }: ComingSoonProps) {
  return (
    <section className="mt-6 max-w-xl rounded-lg border border-dashed border-input bg-card p-6">
      <p className="text-sm font-medium">Built in {milestone}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
