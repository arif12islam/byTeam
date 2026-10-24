import { MobileNav, Sidebar } from "@/components/sidebar";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
