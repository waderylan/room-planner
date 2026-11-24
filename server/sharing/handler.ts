import { migrateDoc } from "../../src/model/migrate";
import type { Doc } from "../../src/model/types";
import type { SharedLayout } from "../../src/sharing/types";
import type { SharingDatabase } from "./database";

const MAX_BODY_BYTES = 256_000;
const LIFETIME = 30 * 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ID = /^[a-f0-9]{48}$/;
const SECRET = /^[a-f0-9]{64}$/;

/** Bind bucket, expiresAt, bucket, hourlyLimit. Existing buckets still advance at capacity. */
export const RATE_LIMIT_UPSERT =
  "INSERT INTO share_rate_limits (bucket, count, expires_at) SELECT ?, 1, ? WHERE EXISTS (SELECT 1 FROM share_rate_limits WHERE bucket = ?) OR (SELECT COUNT(*) FROM share_rate_limits) < 10000 ON CONFLICT(bucket) DO UPDATE SET count = count + 1 WHERE count < ?";

type Option = { id: string; name: string; doc: Doc };
type ShareRow = {
  id: string;
  title: string;
  options_json: string;
  owner_hash: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};
type ParticipantRow = { id: string; name: string };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function token(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
async function hash(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function same(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index++)
    difference |= a.charCodeAt(index) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}
function text(value: unknown, label: string, max: number) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.trim().length > max ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
      );
    })
  )
    throw new HttpError(400, `Invalid ${label}.`);
  return value.trim();
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new HttpError(415, "Use JSON for this request.");
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new HttpError(413, "Shared layouts must be smaller than 250 KB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is missing.");
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  let chunks = 0;
  let done = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () =>
        reject(new HttpError(408, "The request body timed out. Try again.")),
      10_000,
    );
    onAbort = () => reject(new HttpError(400, "The request was interrupted."));
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), interrupted]);
      if (next.done) {
        done = true;
        break;
      }
      if (++chunks > 4096)
        throw new HttpError(400, "The request body is too fragmented.");
      if (length + next.value.byteLength > MAX_BODY_BYTES) {
        throw new HttpError(413, "Shared layouts must be smaller than 250 KB.");
      }
      bytes.set(next.value, length);
      length += next.value.byteLength;
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    if (!done) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, length),
      ),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid request JSON.");
  }
}
function bearer(request: Request) {
  const value = request.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!value || !SECRET.test(value))
    throw new HttpError(401, "This action needs a valid invitation identity.");
  return value;
}
async function rate(
  db: SharingDatabase,
  bucket: string,
  limit: number,
  now: number,
) {
  const key = `${bucket}:${Math.floor(now / HOUR)}`;
  const results = await db.batch([
    db.prepare("DELETE FROM share_rate_limits WHERE expires_at <= ?").bind(now),
    db.prepare(RATE_LIMIT_UPSERT).bind(key, now + HOUR * 2, key, limit),
  ]);
  const result = results[1] as { meta?: { changes?: number } };
  if (!result.meta?.changes)
    throw new HttpError(429, "Too many requests. Try again later.");
}
async function liveShare(
  db: SharingDatabase,
  id: string,
  now: number,
): Promise<ShareRow> {
  const row = await db
    .prepare("SELECT * FROM shares WHERE id = ?")
    .bind(id)
    .first<ShareRow>();
  if (!row || row.revoked_at !== null || row.expires_at <= now)
    throw new HttpError(404, "This layout link has expired or been revoked.");
  return row;
}
async function participant(
  db: SharingDatabase,
  request: Request,
  shareId: string,
) {
  const row = await db
    .prepare(
      "SELECT id, name FROM share_participants WHERE share_id = ? AND token_hash = ?",
    )
    .bind(shareId, await hash(bearer(request)))
    .first<ParticipantRow>();
  if (!row)
    throw new HttpError(
      401,
      "Your invitation identity is no longer available. Join again.",
    );
  return row;
}

export async function handleSharingRequest(
  request: Request,
  db: SharingDatabase,
  options: { clientAddress?: string; now?: () => number } = {},
): Promise<Response> {
  try {
    const clock = () => options.now?.() ?? Date.now();
    const now = clock();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const address = (await hash(options.clientAddress ?? "local")).slice(0, 32);
    if (path === "/api/shares") {
      if (request.method !== "POST")
        throw new HttpError(405, "Method not allowed.");
      await rate(db, `create:${address}`, 10, now);
      const input = await body(request);
      const title = text(input.title, "title", 120);
      if (
        !Array.isArray(input.options) ||
        input.options.length < 1 ||
        input.options.length > 4
      )
        throw new HttpError(400, "Choose one to four layout options.");
      const snapshots: Option[] = input.options.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new HttpError(400, "Invalid layout option.");
        const entry = value as Record<string, unknown>;
        try {
          return {
            id: token(12),
            name: text(entry.name, "layout name", 120),
            doc: migrateDoc(entry.doc),
          };
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(400, "A layout contains invalid room data.");
        }
      });
      const serialized = JSON.stringify(snapshots);
      if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES)
        throw new HttpError(413, "Shared layouts must be smaller than 250 KB.");
      const id = token(24),
        ownerKey = token(),
        expiresAt = now + LIFETIME;
      await db.batch([
        db
          .prepare(
            "DELETE FROM shares WHERE expires_at <= ? OR revoked_at IS NOT NULL",
          )
          .bind(now),
        db
          .prepare("DELETE FROM share_rate_limits WHERE expires_at < ?")
          .bind(now),
      ]);
      const result = await db
        .prepare(
          "INSERT INTO shares (id, title, options_json, owner_hash, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM shares WHERE revoked_at IS NULL AND expires_at > ?) < 500",
        )
        .bind(id, title, serialized, await hash(ownerKey), now, expiresAt, now)
        .run();
      if (!result.meta?.changes)
        throw new HttpError(503, "Sharing is at capacity. Try again later.");
      return json(
        { id, ownerKey, expiresAt: new Date(expiresAt).toISOString() },
        201,
      );
    }
    const match = path.match(
      /^\/api\/shares\/([a-f0-9]{48})(?:\/(participants|vote|comments))?$/,
    );
    if (!match || !ID.test(match[1]))
      throw new HttpError(404, "Layout not found.");
    const [, id, action] = match;
    const share = await liveShare(db, id, now);
    const snapshots = JSON.parse(share.options_json) as Option[];
    if (!action && request.method === "GET") {
      const votes = await db
        .prepare(
          "SELECT option_id, COUNT(*) AS count FROM share_votes WHERE share_id = ? GROUP BY option_id",
        )
        .bind(id)
        .all<{ option_id: string; count: number }>();
      const comments = await db
        .prepare(
          "SELECT c.id, p.name, c.option_id, c.text, c.created_at FROM share_comments c JOIN share_participants p ON p.id = c.participant_id WHERE c.share_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 200",
        )
        .bind(id)
        .all<{
          id: string;
          name: string;
          option_id: string | null;
          text: string;
          created_at: number;
        }>();
      let viewerVote: string | null = null;
      if (request.headers.has("authorization")) {
        const identity = await participant(db, request, id);
        const vote = await db
          .prepare(
            "SELECT option_id FROM share_votes WHERE share_id = ? AND participant_id = ?",
          )
          .bind(id, identity.id)
          .first<{ option_id: string }>();
        viewerVote = vote?.option_id ?? null;
      }
      const result: SharedLayout = {
        id,
        title: share.title,
        createdAt: new Date(share.created_at).toISOString(),
        expiresAt: new Date(share.expires_at).toISOString(),
        options: snapshots.map((option) => ({
          ...option,
          votes:
            votes.results.find((vote) => vote.option_id === option.id)?.count ??
            0,
        })),
        comments: comments.results.map((comment) => ({
          id: comment.id,
          name: comment.name,
          optionId: comment.option_id,
          text: comment.text,
          createdAt: new Date(comment.created_at).toISOString(),
        })),
        viewerVote,
      };
      return json(result);
    }
    if (!action && request.method === "DELETE") {
      if (!same(await hash(bearer(request)), share.owner_hash))
        throw new HttpError(403, "Only the creator can revoke this link.");
      await db
        .prepare("UPDATE shares SET revoked_at = ? WHERE id = ?")
        .bind(now, id)
        .run();
      return json({ revoked: true });
    }
    if (action === "participants" && request.method === "POST") {
      await rate(db, `join:${address}:${id}`, 30, now);
      const input = await body(request);
      const name = text(input.name, "name", 40),
        participantId = token(24),
        participantKey = token();
      const result = await db
        .prepare(
          "INSERT INTO share_participants (id, share_id, name, token_hash, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM share_participants WHERE share_id = ?) < 500 AND EXISTS (SELECT 1 FROM shares WHERE id = ? AND revoked_at IS NULL AND expires_at > ?)",
        )
        .bind(
          participantId,
          id,
          name,
          await hash(participantKey),
          now,
          id,
          id,
          clock(),
        )
        .run();
      if (!result.meta?.changes) {
        await liveShare(db, id, clock());
        throw new HttpError(
          429,
          "This invitation has reached its participant limit.",
        );
      }
      return json({ id: participantId, participantKey, name }, 201);
    }
    if (
      (action === "vote" && request.method === "PUT") ||
      (action === "comments" && request.method === "POST")
    ) {
      const identity = await participant(db, request, id);
      await rate(db, `feedback:${id}:${identity.id}`, 60, now);
      const input = await body(request);
      const optionId =
        input.optionId === null || input.optionId === undefined
          ? null
          : text(input.optionId, "layout option", 40);
      if (optionId && !snapshots.some((option) => option.id === optionId))
        throw new HttpError(400, "Choose a layout from this invitation.");
      if (action === "vote") {
        if (!optionId) throw new HttpError(400, "Choose a layout to vote for.");
        const result = await db
          .prepare(
            "INSERT INTO share_votes (share_id, participant_id, option_id, updated_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shares WHERE id = ? AND revoked_at IS NULL AND expires_at > ?) ON CONFLICT(share_id, participant_id) DO UPDATE SET option_id = excluded.option_id, updated_at = excluded.updated_at",
          )
          .bind(id, identity.id, optionId, now, id, clock())
          .run();
        if (!result.meta?.changes) await liveShare(db, id, clock());
        return json({ optionId });
      }
      const comment = text(input.text, "comment", 1000),
        clientId = text(input.clientId, "comment identifier", 80);
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(clientId))
        throw new HttpError(400, "Invalid comment identifier.");
      const existing = await db
        .prepare(
          "SELECT id FROM share_comments WHERE share_id = ? AND participant_id = ? AND client_id = ?",
        )
        .bind(id, identity.id, clientId)
        .first<{ id: string }>();
      if (existing) {
        await liveShare(db, id, clock());
        return json({ id: existing.id }, 200);
      }
      const commentId = token(16);
      const result = await db
        .prepare(
          "INSERT INTO share_comments (id, share_id, participant_id, option_id, text, client_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM share_comments WHERE share_id = ?) < 200 AND EXISTS (SELECT 1 FROM shares WHERE id = ? AND revoked_at IS NULL AND expires_at > ?) ON CONFLICT(share_id, participant_id, client_id) DO NOTHING",
        )
        .bind(
          commentId,
          id,
          identity.id,
          optionId,
          comment,
          clientId,
          now,
          id,
          id,
          clock(),
        )
        .run();
      if (!result.meta?.changes) {
        await liveShare(db, id, clock());
        const duplicate = await db
          .prepare(
            "SELECT id FROM share_comments WHERE share_id = ? AND participant_id = ? AND client_id = ?",
          )
          .bind(id, identity.id, clientId)
          .first<{ id: string }>();
        if (duplicate) return json({ id: duplicate.id });
        throw new HttpError(
          429,
          "This invitation has reached its comment limit.",
        );
      }
      return json({ id: commentId }, 201);
    }
    throw new HttpError(405, "Method not allowed.");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    return json(
      { error: "Shared layouts are unavailable. Try again later." },
      503,
    );
  }
}
