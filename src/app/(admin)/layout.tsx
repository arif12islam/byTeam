import { Suspense } from "react";

import { MobileNav, Sidebar } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/session";

/**
 * Sends signed-out visitors to the login screen on a full page load. Layouts
 * do not re-render on client navigation, so this is not the security boundary:
 * every page and server action that touches data calls requireUser or
 * requireRole itself.
 */
async function SignedIn({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

export default function AdminLayout({ children }: LayoutProps<"/">) {
  const account = (
    <Suspense fallback={null}>
      <UserMenu />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh">
      <Sidebar account={account} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav account={account} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-10 md:py-10">
          <Suspense fallback={null}>
            <SignedIn>{children}</SignedIn>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
