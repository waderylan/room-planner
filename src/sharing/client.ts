import type { Project } from "../store/persistence";
import { migrateDoc } from "../model/migrate";
import { serviceFetch } from "../service/client";
import { readShareAccess } from "./access";
import type { CreatedShare, Participant, SharedLayout } from "./types";
import { readBoundedJson } from "../lib/boundedJson";

export class SharingError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
    : AbortSignal.timeout(20_000);
  let response: Response;
  try {
    response = await serviceFetch(path, {
      ...init,
      signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new SharingError(
      "The sharing service could not be reached. Try again.",
      0,
    );
  }
  let value: unknown;
  try {
    value = await readBoundedJson(response, 1_048_576, signal);
  } catch {
    throw new SharingError(
      "The sharing service returned an unreadable response.",
      response.status,
    );
  }
  if (!response.ok) {
    const message = (value as { error?: unknown })?.error;
    throw new SharingError(
      typeof message === "string"
        ? message.slice(0, 240)
        : "The shared layout could not be updated.",
      response.status,
    );
  }
  return value;
}

function invitationPath(id: string): string {
  if (typeof id !== "string" || !/^[a-f0-9]{48}$/.test(id))
    throw new SharingError("This invitation link is invalid.", 400);
  return `/api/shares/${id}`;
}

export async function createShare(
  title: string,
  projects: Project[],
  signal?: AbortSignal,
): Promise<CreatedShare> {
  const value = (await request("/api/shares", {
    method: "POST",
    signal,
    body: JSON.stringify({
      title,
      options: projects.map((project) => ({
        name: project.name,
        doc: project.doc,
      })),
    }),
  })) as CreatedShare;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    typeof value.ownerKey !== "string" ||
    typeof value.expiresAt !== "string" ||
    !/^[a-f0-9]{48}$/.test(value.id) ||
    !/^[a-f0-9]{64}$/.test(value.ownerKey) ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new SharingError(
      "The sharing service returned an invalid invitation.",
      502,
    );
  return value;
}

/** Validate remote documents before they reach the SVG renderer or local design store. */
export function parseSharedLayout(raw: unknown): SharedLayout {
  if (!raw || typeof raw !== "object")
    throw new SharingError("Invalid shared layout.", 502);
  const value = raw as SharedLayout;
  if (
    typeof value.id !== "string" ||
    !/^[a-f0-9]{48}$/.test(value.id) ||
    typeof value.title !== "string" ||
    value.title.length > 120 ||
    typeof value.createdAt !== "string" ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.options) ||
    value.options.length < 1 ||
    value.options.length > 4 ||
    !Array.isArray(value.comments) ||
    value.comments.length > 200
  )
    throw new SharingError("Invalid shared layout.", 502);
  const options = value.options.map((option) => {
    if (
      !option ||
      typeof option.id !== "string" ||
      !/^[a-f0-9]{24}$/.test(option.id) ||
      typeof option.name !== "string" ||
      option.name.length > 120 ||
      !Number.isSafeInteger(option.votes) ||
      option.votes < 0
    )
      throw new SharingError("Invalid shared layout option.", 502);
    return {
      id: option.id,
      name: option.name,
      votes: option.votes,
      doc: migrateDoc(option.doc),
    };
  });
  if (new Set(options.map((option) => option.id)).size !== options.length)
    throw new SharingError("Invalid shared layout options.", 502);
  const comments = value.comments.map((comment) => {
    if (
      !comment ||
      typeof comment.id !== "string" ||
      comment.id.length > 80 ||
      typeof comment.name !== "string" ||
      comment.name.length > 40 ||
      typeof comment.text !== "string" ||
      comment.text.length > 1000 ||
      typeof comment.createdAt !== "string" ||
      !Number.isFinite(Date.parse(comment.createdAt)) ||
      (comment.optionId !== null &&
        !options.some((option) => option.id === comment.optionId))
    )
      throw new SharingError("Invalid shared comment.", 502);
    return {
      id: comment.id,
      name: comment.name,
      text: comment.text,
      optionId: comment.optionId,
      createdAt: comment.createdAt,
    };
  });
  const viewerVote =
    value.viewerVote === null ||
    options.some((option) => option.id === value.viewerVote)
      ? value.viewerVote
      : null;
  return {
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    options,
    comments,
    viewerVote,
  };
}

export async function fetchShare(
  id: string,
  signal?: AbortSignal,
): Promise<SharedLayout> {
  const key = readShareAccess(id).participantKey;
  return parseSharedLayout(
    await request(invitationPath(id), {
      signal,
      ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}),
    }),
  );
}

export async function joinShare(
  id: string,
  name: string,
): Promise<Participant> {
  const value = (await request(`${invitationPath(id)}/participants`, {
    method: "POST",
    body: JSON.stringify({ name }),
  })) as Participant;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    typeof value.participantKey !== "string" ||
    typeof value.name !== "string" ||
    value.name.length > 40 ||
    !/^[a-f0-9]{48}$/.test(value.id) ||
    !/^[a-f0-9]{64}$/.test(value.participantKey)
  )
    throw new SharingError(
      "The sharing service returned an invalid identity.",
      502,
    );
  return value;
}
export async function voteForLayout(
  id: string,
  optionId: string,
  participantKey: string,
): Promise<void> {
  await request(`${invitationPath(id)}/vote`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${participantKey}` },
    body: JSON.stringify({ optionId }),
  });
}
export async function commentOnLayout(
  id: string,
  optionId: string | null,
  text: string,
  clientId: string,
  participantKey: string,
): Promise<void> {
  await request(`${invitationPath(id)}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${participantKey}` },
    body: JSON.stringify({ optionId, text, clientId }),
  });
}
export async function revokeShare(id: string, ownerKey: string): Promise<void> {
  await request(invitationPath(id), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ownerKey}` },
  });
}
