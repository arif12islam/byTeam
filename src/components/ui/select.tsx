import * as React from "react";

import { cn } from "@/lib/utils";

/** A native select, so it works well on phones. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "block h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-xs sm:h-9 sm:text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
