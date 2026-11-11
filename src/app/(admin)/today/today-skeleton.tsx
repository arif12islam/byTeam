/** What shows while Today is worked out: the same shapes as the page, in grey. */
export function TodaySkeleton() {
  const block = "animate-pulse rounded-xl bg-secondary motion-reduce:animate-none";
  return (
    <div aria-busy="true" aria-label="Loading today" className="grid gap-4 sm:gap-5">
      <div className={`${block} h-12 w-40`} />
      <div className={`${block} h-48`} />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={`${block} h-96`} />
        <div className={`${block} hidden h-64 lg:block`} />
      </div>
    </div>
  );
}
