import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "block h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base sm:h-10 sm:text-sm placeholder:text-muted-foreground disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
