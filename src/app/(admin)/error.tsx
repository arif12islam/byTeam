"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/components/error-panel";

/** A screen inside the app failed to load. The menu stays, so people can go elsewhere or try again. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorPanel digest={digest} onRetry={retry} />;
}
