import type { SharingDatabase } from "../sharing/database";
import { RATE_LIMIT_UPSERT } from "../sharing/handler";

export const DAILY_SERVICE_LIMIT = 5_000;
export const CLIENT_MINUTE_LIMIT = 60;
const DAY = 86_400_000;
export type Admission =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; message: string; retryAfter: number };

/** Atomic database counters are shared by all Worker locations and survive restarts. */
export async function admitServiceRequest(
  db: SharingDatabase,
  address: string,
  now = Date.now(),
): Promise<Admission> {
  const addressHash = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address)),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const minute = Math.floor(now / 60_000);
  const clientBucket = `service:client:${addressHash}:${minute}`;
  const client = await db.batch([
    db.prepare("DELETE FROM share_rate_limits WHERE expires_at <= ?").bind(now),
    db
      .prepare(RATE_LIMIT_UPSERT)
      .bind(
        clientBucket,
        (minute + 2) * 60_000,
        clientBucket,
        CLIENT_MINUTE_LIMIT,
      ),
  ]);
  if (!Number((client[1] as { meta?: { changes?: number } }).meta?.changes))
    return {
      allowed: false,
      status: 429,
      message: "Too many requests. Try again shortly.",
      retryAfter: Math.max(1, Math.ceil(((minute + 1) * 60_000 - now) / 1000)),
    };
  const day = Math.floor(now / DAY);
  const bucket = `service:daily:${day}`;
  const daily = await db
    .prepare(RATE_LIMIT_UPSERT)
    .bind(bucket, (day + 2) * DAY, bucket, DAILY_SERVICE_LIMIT)
    .run();
  if (!Number(daily.meta?.changes))
    return {
      allowed: false,
      status: 503,
      message: "The daily service limit has been reached. Try again tomorrow.",
      retryAfter: Math.max(1, Math.ceil(((day + 1) * DAY - now) / 1000)),
    };
  return { allowed: true };
}
