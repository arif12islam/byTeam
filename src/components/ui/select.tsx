import * as React from "react";

import { cn } from "@/lib/utils";

/** A native select, so it works well on phones. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "block h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base sm:h-10 sm:text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
