import { useState } from "react";
import { DotsThree, Plus } from "@phosphor-icons/react";
import { useInventoryStore } from "../../inventory/inventoryStore";
import type { InventoryEntry } from "../../inventory/types";
import { useStore } from "../../store/store";
import { footprintSize, localPolygon } from "../../geometry/shape";
import { formatLengthCompact } from "../../format/length";
import { unitScale } from "../../model/units";
import { Menu } from "../ui/Menu";
import { IconButton } from "../ui/IconButton";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { InventoryItemDialog } from "./InventoryItemDialog";

export function InventoryList({ compact = false }: { compact?: boolean }) {
  const entries = useInventoryStore((state) => state.entries);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const unit = useStore((state) => state.activeRoom().unit);
  const [editing, setEditing] = useState<InventoryEntry | null>(null);
  const [removing, setRemoving] = useState<InventoryEntry | null>(null);
  const [query, setQuery] = useState("");
  const factor = unitScale("m", unit);
  const filtered = entries.filter((entry) =>
    entry.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <input
        type="search"
        aria-label="Search my furniture"
        placeholder="Search my furniture"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
      />
      <div
        className={
          compact
            ? "flex flex-col gap-2"
            : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {filtered.map((entry) => {
          const size = footprintSize(entry.footprint);
          const padding = Math.max(size.w, size.d) * 0.15;
          return (
            <article
              key={entry.id}
              className={`rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] ${compact ? "p-3" : "p-4"}`}
            >
              {!compact && (
                <svg
                  aria-hidden="true"
                  viewBox={`${-padding} ${-padding} ${size.w + padding * 2} ${size.d + padding * 2}`}
                  className="mb-4 h-28 w-full rounded-lg bg-[var(--bg)] p-4"
                >
                  <polygon
                    points={localPolygon(entry.footprint)
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                    fill={entry.color}
                    fillOpacity={0.2}
                    stroke={entry.color}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-[var(--text)]">
                    {entry.name}
                  </h3>
                  <p className="mt-1 text-[11px] tabular-nums text-[var(--text-muted)]">
                    {formatLengthCompact(size.w * factor, unit)} ×{" "}
                    {formatLengthCompact(size.d * factor, unit)} ×{" "}
                    {formatLengthCompact(entry.height * factor, unit)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {entry.quantity} owned
                  </p>
                </div>
                <Menu
                  trigger={
                    <IconButton
                      aria-label={`Furniture options for ${entry.name}`}
                      icon={<DotsThree size={20} />}
                    />
                  }
                  items={[
                    {
                      key: "edit",
                      label: "Edit",
                      onSelect: () => setEditing(entry),
                    },
                    ...(entry.source
                      ? [
                          {
                            key: "source",
                            label: "Open product page",
                            onSelect: () =>
                              window.open(
                                entry.source!.url,
                                "_blank",
                                "noopener,noreferrer",
                              ),
                          },
                        ]
                      : []),
                    {
                      key: "remove",
                      label: "Remove",
                      onSelect: () => setRemoving(entry),
                    },
                  ]}
                />
              </div>
              {compact && activeProjectId && (
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  icon={<Plus size={14} />}
                  onClick={() => useStore.getState().addInventoryItem(entry)}
                  aria-label={`Place ${entry.name}`}
                >
                  Add to room
                </Button>
              )}
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="py-7 text-center text-sm text-[var(--text-muted)]">
          {query ? "No furniture found" : "No saved furniture"}
        </p>
      )}
      <InventoryItemDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing ?? undefined}
      />
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove saved furniture?"
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removing)
                  useInventoryStore.getState().removeEntry(removing.id);
                setRemoving(null);
              }}
            >
              Remove furniture
            </Button>
          </>
        }
      >
        <p>{removing?.name}</p>
      </Dialog>
    </>
  );
}
