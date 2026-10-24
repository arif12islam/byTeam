import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-forest text-forest-foreground shadow-card sm:size-12">
            <Icon className="size-5 sm:size-[22px]" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 max-w-prose">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}
