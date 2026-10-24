import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-card text-foreground shadow-xs hover:bg-secondary",
        ghost: "hover:bg-secondary",
        destructive: "bg-destructive text-white shadow-sm hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-10 px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * `pending` shows a spinner over the label and turns the button off while a
 * save is running. The label stays in place but see-through, so the button
 * keeps its exact size and nothing around it moves.
 */
function Button({
  className,
  variant,
  size,
  pending = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { pending?: boolean }) {
  return (
    <button
      data-slot="button"
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={cn(buttonVariants({ variant, size, className }), pending && "relative")}
      {...props}
    >
      {pending ? <Loader2 aria-hidden className="absolute inset-0 m-auto animate-spin" /> : null}
      <span className={cn("inline-flex items-center justify-center gap-2", pending && "opacity-0")}>{children}</span>
    </button>
  );
}

export { Button, buttonVariants };
