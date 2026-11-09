import { generateVAPIDKeys } from "web-push";

import type { getDb } from "@/db";
import { pushKeys } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

export type VapidKeys = { publicKey: string; privateKey: string };

/**
 * The server's signing keys for web push. Made on first use and kept in the
 * database, so there is nothing to set up and every server instance agrees on
 * them. Two instances asking at once end up with the same row.
 */
export async function getOrCreateVapidKeys(db: Db): Promise<VapidKeys> {
  const read = async () => (await db.select({ publicKey: pushKeys.publicKey, privateKey: pushKeys.privateKey }).from(pushKeys))[0];

  const existing = await read();
  if (existing) return existing;

  const made = generateVAPIDKeys();
  await db.insert(pushKeys).values({ id: 1, publicKey: made.publicKey, privateKey: made.privateKey }).onConflictDoNothing();
  return (await read())!;
}
