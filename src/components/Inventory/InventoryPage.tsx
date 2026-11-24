import { useRef, useState } from "react";
import {
  ArrowLeft,
  DownloadSimple,
  Link,
  Plus,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useInventoryStore } from "../../inventory/inventoryStore";
import { InventoryItemDialog } from "./InventoryItemDialog";
import { InventoryList } from "./InventoryList";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export function InventorySaveError() {
  const status = useInventoryStore((state) => state.saveStatus);
  const error = useInventoryStore((state) => state.saveError);
  if (status !== "error") return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]"
    >
      <WarningCircle size={16} />
      <span className="flex-1">{error}</span>
      <Button
        size="sm"
        onClick={() => useInventoryStore.getState().retrySave()}
      >
        Retry
      </Button>
      <Button
        size="sm"
        onClick={() => useInventoryStore.getState().exportInventory()}
      >
        Download backup
      </Button>
    </div>
  );
}

export function InventoryPage({
  onBack,
  onImportLink,
}: {
  onBack: () => void;
  onImportLink?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const count = useInventoryStore((state) => state.entries.length);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-[76px] items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 sm:px-10">
        <IconButton
          aria-label="Back to designs"
          icon={<ArrowLeft size={19} />}
          onClick={onBack}
        />
        <h1 className="text-base font-semibold">My furniture</h1>
        <span className="text-xs text-[var(--text-muted)]">{count}</span>
        <div className="ml-auto flex gap-2">
          <IconButton
            aria-label="Import furniture backup"
            icon={<UploadSimple size={18} />}
            onClick={() => file.current?.click()}
          />
          <IconButton
            aria-label="Download furniture backup"
            icon={<DownloadSimple size={18} />}
            onClick={() => useInventoryStore.getState().exportInventory()}
          />
        </div>
      </header>
      <main className="mx-auto flex max-w-[1152px] flex-col gap-6 px-5 py-8 sm:px-10 sm:py-12">
        <InventorySaveError />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your furniture
          </h2>
          <div className="flex gap-2">
            {onImportLink && (
              <Button icon={<Link size={16} />} onClick={onImportLink}>
                Import from link
              </Button>
            )}
            <Button
              variant="primary"
              icon={<Plus size={17} />}
              onClick={() => setCreating(true)}
            >
              New furniture
            </Button>
          </div>
        </div>
        <InventoryList />
      </main>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Furniture backup file"
        onChange={async (event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) {
            if (selected.size > 2 * 1024 * 1024)
              useInventoryStore.setState({
                saveStatus: "error",
                saveError: "Furniture backups must be smaller than 2 MB.",
              });
            else {
              try {
                useInventoryStore
                  .getState()
                  .importInventory(await selected.text());
              } catch {
                useInventoryStore.setState({
                  saveStatus: "error",
                  saveError: "This furniture backup could not be read.",
                });
              }
            }
          }
        }}
      />
      <InventoryItemDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
