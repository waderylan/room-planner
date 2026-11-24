import { useEffect, useRef, useState } from "react";
import { ArrowSquareOut, LinkSimple } from "@phosphor-icons/react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { importProduct } from "../../productImport/client";
import { serviceIsConfigured } from "../../service/client";
import {
  parseDimensionToMeters,
  parsePastedSpecifications,
} from "../../productImport/parser";
import type {
  ConfirmedProduct,
  DimensionField,
  ProductCandidate,
} from "../../productImport/types";

interface ProductImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (product: ConfirmedProduct) => void | boolean;
}
type DisplayUnit = "in" | "cm" | "m";
const FACTORS: Record<DisplayUnit, number> = { in: 0.0254, cm: 0.01, m: 1 };
const FIELDS: DimensionField[] = ["width", "depth", "height"];
const inputClass = "text-input";

function display(meters: number | undefined, unit: DisplayUnit) {
  return meters === undefined
    ? ""
    : String(Number((meters / FACTORS[unit]).toFixed(4)));
}
function sourceLink(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function ProductImportDialog({
  open,
  onClose,
  onSave,
}: ProductImportDialogProps) {
  const [url, setUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<DimensionField, string>>({
    width: "",
    depth: "",
    height: "",
  });
  const [meters, setMeters] = useState<
    Record<DimensionField, number | undefined>
  >({ width: undefined, depth: undefined, height: undefined });
  const [unit, setUnit] = useState<DisplayUnit>("in");
  const [specifications, setSpecifications] = useState("");
  const [details, setDetails] = useState(false);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState("");
  const available = serviceIsConfigured();
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setSourceUrl("");
      setCandidates([]);
      setSelected("");
      setName("");
      setValues({ width: "", depth: "", height: "" });
      setMeters({ width: undefined, depth: undefined, height: undefined });
      setUnit("in");
      setSpecifications("");
      setDetails(false);
      setReason(
        available
          ? ""
          : "Link import is unavailable on this host. Enter dimensions instead.",
      );
      setWorking(false);
    }
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [open, available]);

  function applyCandidate(candidate: ProductCandidate, index: number) {
    setSelected(String(index));
    setName(
      (candidate.variantLabel &&
      !candidate.name
        .toLowerCase()
        .includes(candidate.variantLabel.toLowerCase())
        ? `${candidate.name} · ${candidate.variantLabel}`
        : candidate.name
      ).slice(0, 120),
    );
    if (candidate.url) setSourceUrl(candidate.url);
    setMeters({
      width: candidate.widthM,
      depth: candidate.depthM,
      height: candidate.heightM,
    });
    setValues({
      width: display(candidate.widthM, unit),
      depth: display(candidate.depthM, unit),
      height: display(candidate.heightM, unit),
    });
  }

  async function findProduct() {
    if (!url.trim() || working || !available) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setWorking(true);
    setReason("");
    setCandidates([]);
    setSelected("");
    setName("");
    setValues({ width: "", depth: "", height: "" });
    setMeters({ width: undefined, depth: undefined, height: undefined });
    setDetails(false);
    setSourceUrl(sourceLink(url.trim()) ?? "");
    try {
      const result = await importProduct(url.trim(), controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      setSourceUrl(result.sourceUrl);
      setCandidates(result.candidates);
      setDetails(true);
      setName("");
      setValues({ width: "", depth: "", height: "" });
      if (result.candidates.length === 1)
        applyCandidate(result.candidates[0], 0);
      setReason(result.warnings[0] ?? "");
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) {
        setDetails(true);
        setReason(
          error instanceof Error
            ? error.message
            : "Product import is unavailable. Enter dimensions instead.",
        );
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setWorking(false);
      }
    }
  }

  function changeUnit(next: DisplayUnit) {
    setValues(
      (current) =>
        Object.fromEntries(
          FIELDS.map((field) => {
            const measurement = meters[field];
            return [
              field,
              measurement === undefined
                ? current[field]
                : display(measurement, next),
            ];
          }),
        ) as Record<DimensionField, string>,
    );
    setUnit(next);
  }
  const ready =
    Boolean(name.trim()) &&
    FIELDS.every((field) => meters[field] !== undefined) &&
    !working &&
    (candidates.length <= 1 || selected !== "");

  function save() {
    if (!ready) return;
    const candidate = candidates[Number(selected)];
    const result = onSave({
      name: name.trim(),
      widthM: meters.width!,
      depthM: meters.depth!,
      heightM: meters.height!,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(candidate?.sku ? { sku: candidate.sku.slice(0, 120) } : {}),
      ...(candidate?.brand ? { brand: candidate.brand.slice(0, 120) } : {}),
    });
    if (result !== false) onClose();
    else setReason("Furniture could not be saved.");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import furniture"
      maxWidthClassName="max-w-lg"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void findProduct();
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-2 text-xs font-medium text-[var(--text)]">
          <span>Product link</span>
          <input
            aria-label="Product link"
            className={inputClass}
            type="url"
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            autoFocus
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              request.current?.abort();
              request.current = null;
              setWorking(false);
              setCandidates([]);
              setSelected("");
              setDetails(true);
              setReason("");
              setSourceUrl(sourceLink(url) ?? "");
            }}
          >
            Enter dimensions
          </Button>
          <Button
            type="submit"
            icon={<LinkSimple size={16} />}
            disabled={working || !url.trim() || !available}
          >
            {working ? "Reading product…" : "Find furniture"}
          </Button>
        </div>
      </form>
      {reason && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-[var(--bg-inset)] p-3 text-xs text-[var(--text-muted)]"
        >
          {reason}
        </p>
      )}
      {details && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="mt-5 flex flex-col gap-4 border-t border-[var(--border)] pt-5"
        >
          {candidates.length > 1 && (
            <label className="flex flex-col gap-2 text-xs font-medium text-[var(--text)]">
              <span>Variant</span>
              <select
                aria-label="Product variant"
                className={inputClass}
                value={selected}
                onChange={(event) => {
                  if (event.target.value !== "")
                    applyCandidate(
                      candidates[Number(event.target.value)],
                      Number(event.target.value),
                    );
                  else setSelected("");
                }}
              >
                <option value="">Choose variant</option>
                {candidates.map((candidate, index) => (
                  <option key={index} value={index}>
                    {candidate.name}
                    {candidate.variantLabel
                      ? ` · ${candidate.variantLabel}`
                      : ""}
                    {candidate.sku ? ` · ${candidate.sku}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--text)]">
            <span>Name</span>
            <input
              aria-label="Furniture name"
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <span className="text-xs font-medium text-[var(--text)]">
              Dimensions
            </span>
            <select
              aria-label="Dimension unit"
              className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
              value={unit}
              onChange={(event) =>
                changeUnit(event.target.value as DisplayUnit)
              }
            >
              <option value="in">in</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {FIELDS.map((field) => (
              <label
                key={field}
                className="flex min-w-0 flex-col gap-2 text-xs text-[var(--text-muted)]"
              >
                <span>{field[0].toUpperCase() + field.slice(1)}</span>
                <input
                  aria-label={`Furniture ${field}`}
                  className={inputClass}
                  inputMode="decimal"
                  maxLength={60}
                  value={values[field]}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMeters((current) => ({
                      ...current,
                      [field]: parseDimensionToMeters(value, unit),
                    }));
                    setValues((current) => ({
                      ...current,
                      [field]: value,
                    }));
                  }}
                  required
                />
              </label>
            ))}
          </div>
          <details className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs">
            <summary className="cursor-pointer font-medium text-[var(--text)]">
              Paste product specifications
            </summary>
            <textarea
              aria-label="Product specifications"
              className="mt-3 min-h-24 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs text-[var(--text)]"
              maxLength={20000}
              value={specifications}
              onChange={(event) => setSpecifications(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={!specifications.trim()}
              onClick={() => {
                const parsed = parsePastedSpecifications(specifications);
                if (!Object.keys(parsed).length) {
                  setReason("No labeled dimensions found.");
                  return;
                }
                setMeters((current) => ({
                  width: parsed.widthM ?? current.width,
                  depth: parsed.depthM ?? current.depth,
                  height: parsed.heightM ?? current.height,
                }));
                setValues((current) => ({
                  width:
                    parsed.widthM === undefined
                      ? current.width
                      : display(parsed.widthM, unit),
                  depth:
                    parsed.depthM === undefined
                      ? current.depth
                      : display(parsed.depthM, unit),
                  height:
                    parsed.heightM === undefined
                      ? current.height
                      : display(parsed.heightM, unit),
                }));
                setReason("");
              }}
            >
              Use dimensions
            </Button>
          </details>
          {sourceUrl && (
            <a
              className="inline-flex items-center gap-1.5 self-start text-xs text-[var(--accent)]"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              View product
              <ArrowSquareOut size={13} />
            </a>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!ready}>
              Save furniture
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
