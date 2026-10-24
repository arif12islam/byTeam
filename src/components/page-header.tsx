import type { LucideIcon } from "lucide-react";

import { accentClasses, type Accent } from "@/components/accent";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** A person's name, to show their initials where the icon would go. */
  avatar?: string;
  /** The color of the icon tile. Defaults to the brand green. */
  accent?: Accent;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, icon: Icon, avatar, accent = "green", actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {avatar ? (
          <Avatar name={avatar} className="size-11 shrink-0 text-base sm:size-12" />
        ) : Icon ? (
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl sm:size-12", accentClasses[accent].solid, accentClasses[accent].glow)}>
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
