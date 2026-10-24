type PageHeaderProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}
