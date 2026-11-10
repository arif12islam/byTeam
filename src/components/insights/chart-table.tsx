/** The numbers behind a chart, for anyone who cannot read the picture. Native details, no script. */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: readonly string[]; rows: readonly (readonly (string | number)[])[] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex min-h-10 cursor-pointer items-center text-xs font-medium text-primary underline-offset-4 hover:underline">Show as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-secondary text-muted-foreground">
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={i === 0 ? "px-3 py-1.5 font-medium" : "px-3 py-1.5 text-right font-medium"}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className={i === 0 ? "px-3 py-1.5" : "px-3 py-1.5 text-right"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
