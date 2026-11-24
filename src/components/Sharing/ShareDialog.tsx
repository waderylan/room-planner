import { useEffect, useRef, useState } from "react";
import { Check, Copy, LinkSimple } from "@phosphor-icons/react";
import type { Project } from "../../store/persistence";
import type { CreatedShare } from "../../sharing/types";
import { createShare, revokeShare } from "../../sharing/client";
import { rememberShareAccess, shareUrl } from "../../sharing/access";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { DesignPreview } from "../DesignPreview";
import { serviceIsConfigured } from "../../service/client";

export function ShareDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
}) {
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const available = serviceIsConfigured();
  const requestRef = useRef<AbortController | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      requestRef.current?.abort();
      return;
    }
    setTitle(projects.length === 1 ? projects[0].name : "Layout options");
    setCreated(null);
    setError("");
    setNotice("");
    setCopied(false);
    setRevoking(false);
    setBusy(false);
    return () => requestRef.current?.abort();
    // Opening a dialog captures the selected documents; editing stays in the planner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !projects.length ||
      projects.length > 4 ||
      !title.trim() ||
      !available
    )
      return;
    setError("");
    setBusy(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await createShare(
        title.trim(),
        projects,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const persisted = rememberShareAccess(result.id, {
        ownerKey: result.ownerKey,
      });
      setCreated(result);
      if (!persisted)
        setNotice(
          "Link management is available only in this tab because device storage is unavailable.",
        );
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "The layouts could not be shared.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(shareUrl(created.id));
      setCopied(true);
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setNotice("Copy the selected link.");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={created ? "Layout invitation" : "Share layouts"}
      maxWidthClassName="max-w-lg"
    >
      {created ? (
        <div className="flex flex-col gap-5">
          <label className="field-label">
            Invite link
            <input
              ref={linkRef}
              className="text-input mt-2"
              aria-label="Layout invite link"
              value={shareUrl(created.id)}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">
              Expires {new Date(created.expiresAt).toLocaleDateString()}
            </span>
            <Button
              variant="primary"
              icon={copied ? <Check size={16} /> : <Copy size={16} />}
              onClick={() => void copy()}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {notice && (
            <p role="status" className="text-xs text-[var(--text-muted)]">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
            <a
              className="text-sm text-[var(--accent)]"
              href={shareUrl(created.id)}
              onClick={onClose}
            >
              Open invitation
            </a>
            <Button
              variant="danger"
              disabled={revoking}
              onClick={async () => {
                setRevoking(true);
                setError("");
                try {
                  await revokeShare(created.id, created.ownerKey);
                  onClose();
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "The link could not be revoked.",
                  );
                  setRevoking(false);
                }
              }}
            >
              Revoke link
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => void publish(event)}
          className="flex flex-col gap-5"
        >
          <label className="field-label">
            Title
            <input
              autoFocus
              className="text-input mt-2"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)]"
              >
                <div className="h-28 bg-[var(--preview-bg)]">
                  <DesignPreview doc={project.doc} />
                </div>
                <span className="flex items-center gap-2 p-3 text-xs text-[var(--text)]">
                  <span className="truncate">{project.name}</span>
                </span>
              </div>
            ))}
          </div>
          {projects.length > 4 && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              Invitations allow up to four layouts.
            </p>
          )}
          {!available && (
            <p role="alert" className="text-sm text-[var(--text-muted)]">
              Sharing is unavailable on this host.
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <LinkSimple size={15} />
            Anyone with the link can view, vote, and comment.
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="dialog-actions mt-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                !projects.length ||
                projects.length > 4 ||
                !title.trim() ||
                !available
              }
            >
              {busy ? "Creating link…" : "Create invite link"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
