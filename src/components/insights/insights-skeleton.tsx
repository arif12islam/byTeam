/** What shows while the facts are worked out: the same grid as the page, in grey. */
export function InsightsSkeleton() {
  const block = "animate-pulse rounded-xl bg-secondary";
  return (
    <div aria-busy="true" aria-label="Working out the facts" className="mt-6 grid max-w-5xl gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-24`} />
        ))}
      </div>
      <div className={`${block} h-64`} />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-44`} />
        ))}
      </div>
    </div>
  );
}
