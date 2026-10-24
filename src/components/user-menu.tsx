import { LogOut } from "lucide-react";

import { signOut } from "@/app/(admin)/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const roleLabel = { owner: "Owner", hr: "HR" } as const;

/**
 * Signed-in name, role and a sign out button. Reads the session, so render it
 * inside Suspense. `onDark` is for the green sidebar.
 */
export async function UserMenu({ onDark = false }: { onDark?: boolean }) {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <Avatar name={user.name} className={onDark ? "bg-forest-line text-forest-foreground" : undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className={cn("text-xs", onDark ? "text-forest-muted" : "text-muted-foreground")}>{roleLabel[user.role]}</p>
      </div>
      <form action={signOut}>
        {onDark ? (
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            className="text-forest-foreground hover:bg-forest-line"
          >
            <LogOut aria-hidden />
          </Button>
        ) : (
          <Button type="submit" variant="outline" size="sm">
            <LogOut aria-hidden />
            Sign out
          </Button>
        )}
      </form>
    </div>
  );
}
