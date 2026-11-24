import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChatCircle,
  Copy,
  ThumbsUp,
} from "@phosphor-icons/react";
import type { SharedLayout } from "../../sharing/types";
import {
  commentOnLayout,
  fetchShare,
  joinShare,
  revokeShare,
  SharingError,
  voteForLayout,
} from "../../sharing/client";
import {
  clearParticipant,
  readShareAccess,
  rememberShareAccess,
} from "../../sharing/access";
import { createFloorPlanSvg } from "../../lib/floorPlan";
import { useStore } from "../../store/store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { DesignPreview } from "../DesignPreview";

type PendingAction =
  | { kind: "vote"; optionId: string }
  | {
      kind: "comment";
      optionId: string | null;
      text: string;
      clientId: string;
    };

export function SharedLayoutPage({
  shareId,
  onBack,
  onOpenDesign,
}: {
  shareId: string;
  onBack: () => void;
  onOpenDesign: () => void;
}) {
  const [layout, setLayout] = useState<SharedLayout | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState(
    () => readShareAccess(shareId).participantName ?? "",
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [joinError, setJoinError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [revokeOpen, setRevokeOpen] = useState(false);
  const mounted = useRef(false);
  const scopeRef = useRef(shareId);
  scopeRef.current = shareId;
  const refreshRef = useRef<AbortController | null>(null);
  const failedComment = useRef<{
    text: string;
    optionId: string | null;
    clientId: string;
  } | null>(null);
  const ownerKey = readShareAccess(shareId).ownerKey;
  const isCurrent = () => mounted.current && scopeRef.current === shareId;

  async function refresh(initial = false) {
    refreshRef.current?.abort();
    const controller = new AbortController();
    refreshRef.current = controller;
    try {
      let result: SharedLayout;
      try {
        result = await fetchShare(shareId, controller.signal);
      } catch (failure) {
        if (failure instanceof SharingError && failure.status === 401) {
          clearParticipant(shareId);
          result = await fetchShare(shareId, controller.signal);
        } else throw failure;
      }
      if (!isCurrent() || controller.signal.aborted) return;
      setLayout(result);
      setError("");
      setRefreshError("");
      setSelectedId((current) =>
        result.options.some((option) => option.id === current)
          ? current
          : result.options[0].id,
      );
    } catch (failure) {
      if (!isCurrent() || controller.signal.aborted) return;
      const message =
        failure instanceof Error
          ? failure.message
          : "The invitation could not be opened.";
      if (
        initial ||
        (failure instanceof SharingError && failure.status === 404)
      ) {
        setError(message);
        setLayout(null);
      } else setRefreshError(message);
    }
  }

  useEffect(() => {
    mounted.current = true;
    setLayout(null);
    setError("");
    setSelectedId("");
    setRoomId("");
    setDraft("");
    setPending(null);
    setBusy(false);
    setStorageNotice("");
    setRevokeOpen(false);
    setName(readShareAccess(shareId).participantName ?? "");
    void refresh(true);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 8_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      refreshRef.current?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // The request owns the current share ID; cancelled responses cannot replace another invitation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const option =
    layout?.options.find((entry) => entry.id === selectedId) ??
    layout?.options[0];
  const room =
    option?.doc.rooms.find((entry) => entry.id === roomId) ??
    option?.doc.rooms.find((entry) => entry.id === option.doc.activeRoomId) ??
    option?.doc.rooms[0];
  const imageUrl = useMemo(
    () =>
      room
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            createFloorPlanSvg(room),
          )}`
        : "",
    [room],
  );

  async function perform(action: PendingAction, participantKey: string) {
    if (action.kind === "vote")
      await voteForLayout(shareId, action.optionId, participantKey);
    else
      await commentOnLayout(
        shareId,
        action.optionId,
        action.text,
        action.clientId,
        participantKey,
      );
    if (!isCurrent()) return;
    if (action.kind === "comment") {
      setDraft((current) => (current === action.text ? "" : current));
      failedComment.current = null;
    }
    setPending(null);
    setJoinError("");
    await refresh();
  }
  async function act(action: PendingAction) {
    if (busy) return;
    const key = readShareAccess(shareId).participantKey;
    if (!key) {
      setPending(action);
      setJoinError("");
      return;
    }
    setBusy(true);
    setRefreshError("");
    try {
      await perform(action, key);
    } catch (failure) {
      if (!isCurrent()) return;
      if (failure instanceof SharingError && failure.status === 401) {
        clearParticipant(shareId);
        setPending(action);
      } else
        setRefreshError(
          failure instanceof Error
            ? failure.message
            : "Your feedback could not be saved.",
        );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  function submitComment(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !option) return;
    const previous = failedComment.current;
    const comment =
      previous?.text === text && previous.optionId === option.id
        ? previous
        : { text, optionId: option.id, clientId: crypto.randomUUID() };
    failedComment.current = comment;
    void act({ kind: "comment", ...comment });
  }
  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || busy || !name.trim()) return;
    setBusy(true);
    setJoinError("");
    try {
      const identity = await joinShare(shareId, name.trim());
      if (!isCurrent()) return;
      if (
        !rememberShareAccess(shareId, {
          participantKey: identity.participantKey,
          participantName: identity.name,
        })
      )
        setStorageNotice(
          "Your name and vote are remembered only in this tab because device storage is unavailable.",
        );
      await perform(pending, identity.participantKey);
    } catch (failure) {
      if (isCurrent())
        setJoinError(
          failure instanceof Error
            ? failure.message
            : "Your feedback could not be saved.",
        );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  function copyToDesigns() {
    if (!option) return;
    const store = useStore.getState();
    const before = store.projects.length;
    store.createProject(option.name, option.doc);
    if (useStore.getState().projects.length > before) onOpenDesign();
  }

  return (
    <div className="library-shell">
      <header className="library-header">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={18} />}
            onClick={onBack}
          >
            My designs
          </Button>
          <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
            Shared layouts
          </span>
        </div>
        {ownerKey && layout && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setRevokeOpen(true)}
          >
            Revoke link
          </Button>
        )}
      </header>
      <main className="mx-auto max-w-[1320px] px-5 py-9 sm:px-10">
        {error ? (
          <div role="alert" className="view-loading">
            <p>{error}</p>
            <Button onClick={() => void refresh(true)}>Try again</Button>
          </div>
        ) : !layout ? (
          <div role="status" className="view-loading">
            Opening shared layouts…
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
                  {layout.title}
                </h1>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Expires {new Date(layout.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <Button icon={<Copy size={16} />} onClick={copyToDesigns}>
                Copy layout to my designs
              </Button>
            </div>
            {refreshError && (
              <div
                className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
                role="alert"
              >
                <span className="flex-1">{refreshError}</span>
                <Button size="sm" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            )}
            {storageNotice && (
              <p
                role="status"
                className="mb-4 text-xs text-[var(--text-muted)]"
              >
                {storageNotice}
              </p>
            )}
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0" aria-label="Layout options">
                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {layout.options.map((entry) => (
                    <button
                      key={entry.id}
                      aria-pressed={option?.id === entry.id}
                      onClick={() => {
                        setSelectedId(entry.id);
                        setRoomId("");
                      }}
                      className={`overflow-hidden rounded-xl border text-left ${
                        option?.id === entry.id
                          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <div className="h-24 bg-[var(--preview-bg)]">
                        <DesignPreview doc={entry.doc} />
                      </div>
                      <span className="flex items-center justify-between gap-2 bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text)]">
                        <span className="truncate font-medium">
                          {entry.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[var(--text-muted)]">
                          <ThumbsUp size={12} />
                          {entry.votes}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {option && room && (
                  <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                      <h2 className="text-sm font-medium text-[var(--text)]">
                        {option.name}
                      </h2>
                      {option.doc.rooms.length > 1 && (
                        <select
                          aria-label="Room in shared layout"
                          value={room.id}
                          onChange={(event) => setRoomId(event.target.value)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]"
                        >
                          {option.doc.rooms.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <img
                      src={imageUrl}
                      alt={`${room.name} floor plan`}
                      className="aspect-[4/3] w-full bg-white object-contain"
                    />
                    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
                      <span className="text-xs text-[var(--text-muted)]">
                        {room.name}
                      </span>
                      <Button
                        variant={
                          layout.viewerVote === option.id
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                        icon={
                          layout.viewerVote === option.id ? (
                            <Check size={15} />
                          ) : (
                            <ThumbsUp size={15} />
                          )
                        }
                        disabled={busy}
                        onClick={() =>
                          void act({ kind: "vote", optionId: option.id })
                        }
                      >
                        {layout.viewerVote === option.id
                          ? "Your choice"
                          : "Choose this layout"}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
              <section aria-label="Layout feedback" className="min-w-0">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <ChatCircle size={17} />
                  Comments
                  <span className="text-xs font-normal text-[var(--text-muted)]">
                    {layout.comments.length}
                  </span>
                </h2>
                <div className="mb-5 flex max-h-[600px] flex-col gap-3 overflow-y-auto">
                  {layout.comments.length ? (
                    layout.comments.map((comment) => (
                      <article
                        key={comment.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[var(--text)]">
                            {comment.name}
                          </span>
                          <time
                            className="text-[var(--text-muted)]"
                            dateTime={comment.createdAt}
                          >
                            {new Date(comment.createdAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </time>
                        </div>
                        {comment.optionId && (
                          <div className="mb-2 text-[11px] text-[var(--accent)]">
                            {
                              layout.options.find(
                                (entry) => entry.id === comment.optionId,
                              )?.name
                            }
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text)]">
                          {comment.text}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="py-4 text-sm text-[var(--text-muted)]">
                      No comments
                    </p>
                  )}
                </div>
                <form onSubmit={submitComment}>
                  <label className="field-label" htmlFor="shared-comment">
                    Comment on {option?.name}
                  </label>
                  <textarea
                    id="shared-comment"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={1000}
                    rows={4}
                    className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={busy || !draft.trim()}
                    >
                      Post comment
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          </>
        )}
      </main>
      <Dialog
        open={pending !== null}
        onClose={() => {
          if (!busy) {
            setPending(null);
            setJoinError("");
          }
        }}
        title="Your name"
      >
        <form onSubmit={(event) => void join(event)}>
          <label className="field-label" htmlFor="participant-name">
            Name
          </label>
          <input
            id="participant-name"
            autoComplete="nickname"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            className="text-input"
            required
          />
          {joinError && (
            <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
              {joinError}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !name.trim()}
            >
              {busy
                ? "Saving…"
                : pending?.kind === "vote"
                  ? "Save choice"
                  : "Post comment"}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={revokeOpen}
        onClose={() => {
          if (!busy) setRevokeOpen(false);
        }}
        title="Revoke invitation?"
        footer={
          <>
            <Button disabled={busy} onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!ownerKey) return;
                setBusy(true);
                try {
                  await revokeShare(shareId, ownerKey);
                  if (!isCurrent()) return;
                  setRevokeOpen(false);
                  setLayout(null);
                  setError("This layout link has been revoked.");
                } catch (failure) {
                  if (!isCurrent()) return;
                  setRefreshError(
                    failure instanceof Error
                      ? failure.message
                      : "The link could not be revoked.",
                  );
                  setRevokeOpen(false);
                } finally {
                  if (isCurrent()) setBusy(false);
                }
              }}
            >
              Revoke link
            </Button>
          </>
        }
      >
        <p>People with this link will lose access to {layout?.title}.</p>
      </Dialog>
    </div>
  );
}
