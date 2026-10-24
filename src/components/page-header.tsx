import { Avatar } from "@/components/ui/avatar";

type PageHeaderProps = {
  title: string;
  description: string;
  /** A person's name, to show their initials next to the title. */
  avatar?: string;
  actions?: React.ReactNode;
};

/** The top of a screen: a title, one line about the screen, and actions on the right. */
export function PageHeader({ title, description, avatar, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {avatar ? <Avatar name={avatar} className="size-10" /> : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions}
    </header>
  );
}
