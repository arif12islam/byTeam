import * as React from "react";

import { toneClasses, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/** A small rounded label colored by what it means. */
function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-current/25 [&_svg]:size-3",
        toneClasses[tone].soft,
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
