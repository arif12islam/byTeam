import { Suspense } from "react";

import { MobileTabBar, MobileTopBar, Sidebar } from "@/components/sidebar";
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
  const sidebarAccount = (
    <Suspense fallback={null}>
      <UserMenu onDark />
    </Suspense>
  );
  const sheetAccount = (
    <Suspense fallback={null}>
      <UserMenu />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh">
      {/* usePathname in the nav needs a boundary on routes with dynamic segments. */}
      <Suspense fallback={<aside className="hidden w-64 shrink-0 bg-sidebar md:block" />}>
        <Sidebar account={sidebarAccount} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:px-10 md:pb-12 md:pt-10">
          <Suspense fallback={null}>
            <SignedIn>{children}</SignedIn>
          </Suspense>
        </main>
      </div>
      <Suspense fallback={null}>
        <MobileTabBar account={sheetAccount} />
      </Suspense>
    </div>
  );
}
