import { signOut } from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

const roleLabel = { owner: "Owner", hr: "HR" } as const;

/** Signed-in name, role and a sign out button. Reads the session, so render it inside Suspense. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{roleLabel[user.role]}</p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
