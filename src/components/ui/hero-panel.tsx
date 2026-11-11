import { cn } from "@/lib/utils";

type HeroPanelProps = {
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * The top of a screen: a soft brand tint that holds the period control and the
 * key numbers. The only place a gradient is allowed.
 */
export function HeroPanel({ title, eyebrow, actions, children, className }: HeroPanelProps) {
  const hasHeader = Boolean(title || eyebrow || actions);
  return (
    <section
      data-slot="hero-panel"
      className={cn("rounded-2xl border border-brand-border bg-gradient-to-br from-brand-soft to-card p-5 text-card-foreground shadow-card sm:p-6", className)}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {eyebrow ? <p className="text-sm font-medium text-brand-soft-foreground">{eyebrow}</p> : null}
            {title ? <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children ? <div className={cn(hasHeader && "mt-4")}>{children}</div> : null}
    </section>
  );
}
