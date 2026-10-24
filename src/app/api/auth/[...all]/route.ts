import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

// Built per request so the build doesn't need a database connection.
export function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
