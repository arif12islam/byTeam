"use client";

import { CalendarPlus, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * The buttons in the leave hero. "Record leave" opens the form right below
 * them. The form stays mounted while it is closed, so a message about the last
 * save is still there when it is opened again.
 */
export function RecordLeave({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          {open ? <X aria-hidden /> : <CalendarPlus aria-hidden />}
          {open ? "Close form" : "Record leave"}
        </Button>
        <Link href="/leave/types" className={buttonVariants({ variant: "outline" })}>
          Leave types
        </Link>
      </div>
      <div id={panelId} hidden={!open} className="mt-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
        {children}
      </div>
    </div>
  );
}
