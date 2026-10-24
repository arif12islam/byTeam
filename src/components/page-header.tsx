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
  /** The color of the banner. Defaults to the brand green. */
  accent?: Accent;
  /** Buttons for the right of the banner. Give them `variant="onColor"` so they stand out on the gradient. */
  actions?: React.ReactNode;
};

/** The colorful banner at the top of a screen: a saturated gradient with the screen's icon, title and a line about it. */
export function PageHeader({ title, description, icon: Icon, avatar, accent = "green", actions }: PageHeaderProps) {
  const colors = accentClasses[accent];
  return (
    <header className={cn("relative overflow-hidden rounded-3xl p-4 shadow-card sm:p-6", colors.banner)}>
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden className={cn("pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full blur-3xl", colors.blob)} />
      <div aria-hidden className="pointer-events-none absolute -right-6 -bottom-10 size-40 rounded-full border-[18px] border-white/10" />
      <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {avatar ? (
            <Avatar name={avatar} className="size-12 shrink-0 text-base ring-2 ring-white/70 sm:size-14" />
          ) : Icon ? (
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/35 backdrop-blur sm:size-14">
              <Icon className="size-6 sm:size-7" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 max-w-prose">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-0.5 text-sm text-white/90">{description}</p>
          </div>
        </div>
        {actions}
      </div>
    </header>
  );
}
