import { useMemo } from "react";
import { useStore } from "../../store/store";
import { polygonArea, worldPolygon } from "../../geometry";
import { computeClearance } from "../../geometry/clearance";

function formatArea(v: number): string {
  return v.toFixed(1);
}

export function StatsPanel() {
  const room = useStore((s) => s.activeRoom());

  const { roomArea, usedArea } = useMemo(() => {
    const roomArea = polygonArea(room.outline);
    const usedArea = room.items.filter((it) => !it.hidden).reduce((sum, it) => sum + polygonArea(worldPolygon(it)), 0);
    return { roomArea, usedArea };
  }, [room.outline, room.items]);

  const freeArea = roomArea - usedArea;
  const overfilled = freeArea < 0;
  const unit = room.unit === "ft" ? "sq ft" : "sq m";

  const selected = room.items.find((it) => it.id === room.selectedItemId);
  const closestGap = useMemo(() => {
    if (!selected) return null;
    const result = computeClearance(selected, room.outline, room.items, room.measureMode);
    return result.closest.distance;
  }, [selected, room.outline, room.items, room.measureMode]);

  return (
    <section className="flex flex-col gap-2.5 border-b border-[var(--border)] px-3.5 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Stats</h2>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Room" value={formatArea(roomArea)} unit={unit} />
        <Stat label="Used" value={formatArea(usedArea)} unit={unit} />
        <Stat label="Free" value={formatArea(freeArea)} unit={unit} danger={overfilled} />
      </div>
      {selected && closestGap !== null && (
        <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] px-2.5 py-1.5 text-xs">
          <span className="text-[var(--text-muted)]">Closest gap</span>
          <span className="tabular-nums font-medium text-[var(--text)]">
            {closestGap < 0.25 ? "touching" : `${closestGap.toFixed(2)} ${room.unit}`}
          </span>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, unit, danger }: { label: string; value: string; unit: string; danger?: boolean }) {
  return (
    <div
      className={
        "rounded-[var(--radius-control)] border px-2 py-1.5 " +
        (danger ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--border)] bg-[var(--bg-inset)]")
      }
    >
      <div className="text-[10px] text-[var(--text-faint)]">{label}</div>
      <div className={"tabular-nums text-sm font-semibold " + (danger ? "text-[var(--danger)]" : "text-[var(--text)]")}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--text-faint)]">{unit}</div>
    </div>
  );
}
