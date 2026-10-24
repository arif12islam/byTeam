import type { LucideIcon } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";

type PageHeaderProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** A person's name, to show their initials where the icon would go. */
  avatar?: string;
  actions?: React.ReactNode;
};

/** The top of a screen: a small brand icon tile, a bold title and a line about the screen. Actions sit on the right. */
export function PageHeader({ title, description, icon: Icon, avatar, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {avatar ? (
          <Avatar name={avatar} className="size-11 text-base" />
        ) : Icon ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions}
    </header>
  );
}
