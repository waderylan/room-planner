import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  ArrowCounterClockwise,
  ShareNetwork,
} from "@phosphor-icons/react";
import { useStore } from "../../store/store";
import { useInventoryStore } from "../../inventory/inventoryStore";
import {
  compareInventory,
  compareInventoryTrial,
  createInventoryTrial,
  defaultAssignments,
  type FitStatus,
  type RoomAssignments,
  type InventoryTrial,
} from "../../inventory/comparison";
import type { Project } from "../../store/persistence";
import type { Doc } from "../../model/types";
import type { InventoryEntry } from "../../inventory/types";
import { DesignPreview } from "../DesignPreview";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

const labels: Record<FitStatus, string> = {
  placed: "Placed",
  "not-placed": "Not placed",
  "needs-layout": "Needs layout",
  "too-large": "Too large",
  "too-tall": "Too tall",
  "different-dimensions": "Different dimensions",
};
interface TrialPreview {
  sourceDoc: Doc;
  inventory: InventoryEntry[];
  assignments: RoomAssignments | undefined;
  output: InventoryTrial;
  savedId?: string;
}

export function ComparePage({
  onBack,
  onOpenDesign,
  initialProjectIds,
  onShare,
}: {
  onBack: () => void;
  onOpenDesign: () => void;
  initialProjectIds?: string[];
  onShare?: (projects: Project[]) => void;
}) {
  const projects = useStore((state) => state.projects);
  const entries = useInventoryStore((state) => state.entries);
  const [selected, setSelected] = useState<string[]>(
    () =>
      initialProjectIds?.slice(0, 4) ??
      projects.slice(0, 2).map((project) => project.id),
  );
  const [assignments, setAssignments] = useState<
    Record<string, RoomAssignments>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trials, setTrials] = useState<Record<string, TrialPreview>>({});
  const compared = useMemo(
    () => projects.filter((project) => selected.includes(project.id)),
    [projects, selected],
  );
  const activeTrials = useMemo(
    () =>
      Object.fromEntries(
        compared.flatMap((project) => {
          const preview = trials[project.id];
          return preview?.sourceDoc === project.doc &&
            preview.inventory === entries &&
            preview.assignments === assignments[project.id]
            ? [[project.id, preview]]
            : [];
        }),
      ),
    [compared, trials, entries, assignments],
  );
  const displayedProjects = compared.map(
    (project): Project =>
      activeTrials[project.id]
        ? {
            ...project,
            id: `${project.id}-trial`,
            name: `${project.name} furniture trial`,
            doc: activeTrials[project.id].output.doc,
          }
        : project,
  );
  const results = useMemo(
    () =>
      Object.fromEntries(
        compared.map((project) => [
          project.id,
          activeTrials[project.id]
            ? compareInventoryTrial(activeTrials[project.id].output, entries, {
                ...defaultAssignments(project.doc, entries),
                ...assignments[project.id],
              })
            : compareInventory(project.doc, entries, {
                ...defaultAssignments(project.doc, entries),
                ...assignments[project.id],
              }),
        ]),
      ),
    [compared, entries, assignments, activeTrials],
  );

  async function trial(id: string) {
    const project = useStore
      .getState()
      .projects.find((current) => current.id === id);
    if (!project || busy) return;
    setBusy(id);
    setNotice(null);
    // Let the pending state paint before bounded geometric search.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    try {
      const output = createInventoryTrial(project.doc, entries, {
        ...defaultAssignments(project.doc, entries),
        ...assignments[id],
      });
      setTrials((current) => ({
        ...current,
        [id]: {
          sourceDoc: project.doc,
          inventory: entries,
          assignments: assignments[id],
          output,
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  function saveTrial(project: Project, preview: TrialPreview) {
    if (preview.savedId) return;
    const before = useStore.getState().projects.length;
    const id = useStore
      .getState()
      .createProject(`${project.name} furniture trial`, preview.output.doc);
    if (useStore.getState().projects.length > before) {
      setTrials((current) => ({
        ...current,
        [project.id]: { ...preview, savedId: id },
      }));
      setNotice(
        `Saved ${
          useStore.getState().projects.find((current) => current.id === id)
            ?.name ?? "trial copy"
        }`,
      );
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-[76px] items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 sm:px-10">
        <IconButton
          aria-label="Back to designs"
          icon={<ArrowLeft size={19} />}
          onClick={onBack}
        />
        <h1 className="text-base font-semibold">Compare apartments</h1>
        <a
          href="#furniture"
          className="ml-auto text-xs font-medium text-[var(--accent)]"
        >
          My furniture
        </a>
      </header>
      <main className="mx-auto flex max-w-[1320px] flex-col gap-7 px-5 py-8 sm:px-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Layouts</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--text-muted)]">
              {entries.reduce((sum, entry) => sum + entry.quantity, 0)}{" "}
              {entries.reduce((sum, entry) => sum + entry.quantity, 0) === 1
                ? "piece"
                : "pieces"}{" "}
              owned
            </span>
            {onShare && (
              <Button
                size="sm"
                icon={<ShareNetwork size={15} />}
                disabled={compared.length < 2 || compared.length > 4}
                onClick={() => onShare(displayedProjects)}
              >
                Share options
              </Button>
            )}
          </div>
        </div>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-3 text-xs font-medium text-[var(--text-muted)]">
            Designs
          </legend>
          {projects.map((project) => (
            <label
              key={project.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                selected.includes(project.id)
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--bg-elevated)]"
              }`}
            >
              <input
                type="checkbox"
                aria-label={`Compare ${project.name}`}
                checked={selected.includes(project.id)}
                disabled={
                  !selected.includes(project.id) && selected.length >= 4
                }
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, project.id]
                      : current.filter((value) => value !== project.id),
                  )
                }
              />
              {project.name}
            </label>
          ))}
        </fieldset>
        {projects.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--text-muted)]">
            No saved designs
          </p>
        )}
        {entries.length === 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <span className="text-sm text-[var(--text-muted)]">
              No saved furniture
            </span>
            <a
              href="#furniture"
              className="text-sm font-medium text-[var(--accent)]"
            >
              Add furniture
            </a>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-[var(--bg-inset)] p-3 text-xs text-[var(--text-muted)]"
          >
            {notice}
          </p>
        )}
        <div
          className={`grid grid-cols-1 gap-5 md:grid-cols-2 ${
            compared.length === 3
              ? "xl:grid-cols-3"
              : compared.length > 3
                ? "xl:grid-cols-4"
                : ""
          }`}
        >
          {compared.map((project) => {
            const result = results[project.id];
            const preview = activeTrials[project.id];
            const assigned = {
              ...defaultAssignments(project.doc, entries),
              ...assignments[project.id],
            };
            return (
              <article
                key={project.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]"
              >
                <div className="h-44 bg-[var(--preview-bg)] p-4">
                  <DesignPreview doc={preview?.output.doc ?? project.doc} />
                </div>
                <div className="flex flex-1 flex-col gap-4 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{project.name}</h3>
                      <span className="mt-1 inline-block text-[10px] font-medium text-[var(--text-muted)]">
                        {preview ? "Furniture trial" : "Existing layout"}
                      </span>
                    </div>
                    {(!preview || preview.savedId) && (
                      <IconButton
                        aria-label={
                          preview?.savedId
                            ? `Open ${project.name} trial`
                            : `Open original ${project.name}`
                        }
                        icon={<ArrowUpRight size={17} />}
                        onClick={() => {
                          useStore
                            .getState()
                            .openProject(preview?.savedId ?? project.id);
                          onOpenDesign();
                        }}
                      />
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">
                      {result.placed}
                      <span className="text-sm font-normal text-[var(--text-muted)]">
                        {" "}
                        / {result.total}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      placed at saved size
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-4">
                    {result.results.map((fit) => (
                      <div
                        key={fit.inventoryId}
                        className="border-t border-[var(--border)] pt-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-xs font-medium">
                            {fit.name}
                            <span className="ml-1.5 text-[var(--text-muted)]">
                              ×{fit.quantity}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                              fit.status === "placed"
                                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                : fit.status === "too-large" ||
                                    fit.status === "too-tall"
                                  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                                  : "bg-[var(--bg-inset)] text-[var(--text-muted)]"
                            }`}
                          >
                            {labels[fit.status]}
                          </span>
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          <span>Room</span>
                          <select
                            aria-label={`Room for ${fit.name} in ${project.name}`}
                            value={assigned[fit.inventoryId]}
                            onChange={(event) => {
                              const roomId = event.target.value;
                              setAssignments((current) => ({
                                ...current,
                                [project.id]: {
                                  ...current[project.id],
                                  [fit.inventoryId]: roomId,
                                },
                              }));
                            }}
                            className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[var(--text)]"
                          >
                            {project.doc.rooms.map((room) => (
                              <option key={room.id} value={room.id}>
                                {room.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {fit.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                  {!preview && (
                    <Button
                      size="sm"
                      disabled={!entries.length || !!busy}
                      icon={<Copy size={14} />}
                      onClick={() => void trial(project.id)}
                    >
                      {busy === project.id ? "Placing…" : "Try my furniture"}
                    </Button>
                  )}
                  {preview && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1"
                        disabled={!!preview.savedId}
                        onClick={() => saveTrial(project, preview)}
                      >
                        {preview.savedId ? "Trial saved" : "Save trial copy"}
                      </Button>
                      <IconButton
                        aria-label={`Reset trial for ${project.name}`}
                        icon={<ArrowCounterClockwise size={16} />}
                        onClick={() =>
                          setTrials((current) => {
                            const next = { ...current };
                            delete next[project.id];
                            return next;
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
