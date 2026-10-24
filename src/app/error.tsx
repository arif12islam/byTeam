"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/components/error-panel";

/** Anything outside the signed-in screens, such as the sign in page. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="px-4 py-10">
      <ErrorPanel digest={digest} onRetry={retry} />
    </main>
  );
}
