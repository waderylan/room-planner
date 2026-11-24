import { useState } from "react";
import { Link, Plus } from "@phosphor-icons/react";
import { useInventoryStore } from "../../inventory/inventoryStore";
import { InventoryList } from "./InventoryList";
import { InventoryItemDialog } from "./InventoryItemDialog";
import { InventorySaveError } from "./InventoryPage";
import { ProductImportDialog } from "../ProductImport/ProductImportDialog";
import { Button } from "../ui/Button";

export function InventoryPanel() {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <InventorySaveError />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          icon={<Link size={14} />}
          onClick={() => setImporting(true)}
        >
          Import link
        </Button>
        <Button
          className="flex-1"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setCreating(true)}
        >
          New furniture
        </Button>
      </div>
      <InventoryList compact />
      <InventoryItemDialog open={creating} onClose={() => setCreating(false)} />
      <ProductImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onSave={(product) =>
          Boolean(
            useInventoryStore
              .getState()
              .saveEntry({
                name: product.name,
                footprint: {
                  kind: "rect",
                  w: product.widthM,
                  d: product.depthM,
                },
                height: product.heightM,
                elevation: 0,
                quantity: 1,
                color: "#8a8f98",
                ...(product.sourceUrl
                  ? {
                      source: {
                        url: product.sourceUrl,
                        ...(product.sku ? { sku: product.sku } : {}),
                        ...(product.brand ? { brand: product.brand } : {}),
                      },
                    }
                  : {}),
              }),
          )
        }
      />
    </div>
  );
}
