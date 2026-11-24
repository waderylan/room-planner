import { useMemo } from "react";
import { useStore } from "../../store/store";
import { polygonArea, worldPolygon, isFullyInside } from "../../geometry";
import { computeClearance } from "../../geometry/clearance";
import { itemsCollide, canShareFloorSpace } from "../../model/collision";
import { formatLengthCompact } from "../../format/length";

export function StatsPanel() {
  const room = useStore((s) => s.activeRoom());
  const { roomArea, items, conflicts } = useMemo(() => {
    const items = room.items.filter((item) => !item.hidden);
    const conflicts = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      if (!isFullyInside(worldPolygon(items[i]), room.outline)) conflicts.add(items[i].id);
      for (let j = i + 1; j < items.length; j++) if (itemsCollide(items[i], items[j], room.unit)) { conflicts.add(items[i].id); conflicts.add(items[j].id); }
    }
    return { roomArea: polygonArea(room.outline), items, conflicts };
  }, [room.outline, room.items, room.unit]);
  const selected = items.find((item) => item.id === room.selectedItemId);
  const closestGap = useMemo(() => {
    if (!selected) return null;
    return computeClearance(selected, room.outline, items.filter((item) => !canShareFloorSpace(selected, item, room.unit)), room.measureMode).closest.distance;
  }, [selected, room.outline, items, room.measureMode, room.unit]);

  return (
    <section className="flex flex-col gap-3 border-b border-[var(--border)] p-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Area" value={roomArea.toFixed(1)} unit={room.unit === "ft" ? "ft²" : "m²"} />
        <Stat label="Furniture" value={String(items.length)} />
        <Stat label="Conflicts" value={String(conflicts.size)} danger={conflicts.size > 0} />
      </div>
      {selected && closestGap !== null && Number.isFinite(closestGap) && <div className="flex items-center justify-between text-xs"><span className="text-[var(--text-muted)]">Closest gap</span><span className="tabular-nums font-medium">{formatLengthCompact(closestGap, room.unit)}</span></div>}
    </section>
  );
}

function Stat({ label, value, unit, danger }: { label: string; value: string; unit?: string; danger?: boolean }) {
  return <div className="min-w-0 rounded-lg bg-[var(--bg)] px-2.5 py-3"><div className="text-[10px] text-[var(--text-muted)]">{label}</div><div className={`mt-1 text-sm font-semibold tabular-nums ${danger ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>{value}{unit && <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">{unit}</span>}</div></div>;
}
