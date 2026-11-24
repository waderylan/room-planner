import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Cube,
  DotsThree,
  HardDrives,
  MagnifyingGlass,
  Moon,
  Plus,
  Sun,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useStore } from "../store/store";
import {
  createFromTemplate,
  ROOM_TEMPLATES,
  type TemplateId,
} from "../model/templates";
import { polygonArea } from "../geometry/polygon";
import { DesignPreview } from "./DesignPreview";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { Menu } from "./ui/Menu";
import { Dialog } from "./ui/Dialog";
import { downloadDesign, MAX_IMPORT_BYTES } from "../lib/files";

export function DesignLibrary({ onOpen }: { onOpen: () => void }) {
  const projects = useStore((s) => s.projects);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [newOpen, setNewOpen] = useState(false);
  const [template, setTemplate] = useState<TemplateId>("empty");
  const [name, setName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const saveStatus = useStore((s) => s.saveStatus);
  const saveError = useStore((s) => s.saveError);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => ROOM_TEMPLATES.map((t) => ({ ...t, doc: createFromTemplate(t.id) })),
    [],
  );
  const filtered = projects
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .toSorted((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );

  function chooseTemplate(id: TemplateId) {
    setTemplate(id);
    setName(
      id === "empty"
        ? "Untitled design"
        : ROOM_TEMPLATES.find((t) => t.id === id)!.name,
    );
    setNewOpen(true);
  }
  async function importFile(file?: File) {
    if (!file) return;
    const store = useStore.getState();
    if (file.size > MAX_IMPORT_BYTES) {
      store.pushToast("Design files must be smaller than 5 MB.", "error");
      return;
    }
    try {
      if (
        store.importProject(
          await file.text(),
          file.name.replace(/\.json$/i, ""),
        )
      )
        onOpen();
    } catch {
      store.pushToast("This file could not be opened.", "error");
    }
  }

  return (
    <div className="library-shell">
      <header className="library-header">
        <a className="brand" href="#designs" aria-label="Room Planner designs">
          <Cube size={25} weight="regular" />
          <span>Room Planner</span>
        </a>
        <div className="library-header-actions">
          <span className="device-status">
            <HardDrives size={15} /> On this device
          </span>
          <IconButton
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            icon={theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            onClick={toggleTheme}
          />
        </div>
      </header>
      <main className="library-content">
        {saveStatus === "error" && (
          <div className="save-error" role="alert">
            <WarningCircle size={18} />
            <span>
              {saveError || "Changes could not be saved on this device."}
            </span>
            <Button size="sm" onClick={() => useStore.getState().flushSave()}>
              Retry
            </Button>
            <Button size="sm" onClick={() => useStore.getState().exportDoc()}>
              Download backup
            </Button>
          </div>
        )}
        <div className="library-title-row">
          <div>
            <h1>
              Your designs
              <span className="design-count">{projects.length}</span>
            </h1>
          </div>
          <Button
            variant="primary"
            icon={<Plus size={18} />}
            onClick={() => chooseTemplate("empty")}
          >
            New design
          </Button>
        </div>

        <section
          aria-labelledby="templates-heading"
          className="template-section"
        >
          <h2 id="templates-heading">Start with a room</h2>
          <div className="template-grid">
            {previews.map((t) => (
              <button
                className="template-card"
                key={t.id}
                onClick={() => chooseTemplate(t.id)}
              >
                <div className="template-preview">
                  <DesignPreview doc={t.doc} />
                  <span className="template-add">
                    <Plus size={17} />
                  </span>
                </div>
                <span className="template-name">
                  {t.name}
                  <ArrowUpRight size={15} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="saved-heading" className="saved-section">
          <div className="section-toolbar">
            <h2 id="saved-heading">Saved designs</h2>
            <div className="library-filters">
              <label className="search-field">
                <MagnifyingGlass size={17} />
                <input
                  aria-label="Search designs"
                  placeholder="Search designs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <label className="sort-field">
                <ArrowDown size={14} />
                <select
                  aria-label="Sort designs"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="updated">Last edited</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <IconButton
                aria-label="Import design"
                title="Import design"
                icon={<UploadSimple size={18} />}
                onClick={() => fileRef.current?.click()}
              />
              <input
                ref={fileRef}
                className="hidden"
                type="file"
                accept=".json,application/json"
                aria-label="Import design file"
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="design-grid">
            {filtered.map((project) => {
              const rooms = project.doc.rooms;
              const totalAreaM = rooms.reduce(
                (area, r) =>
                  area +
                  polygonArea(r.outline) * (r.unit === "ft" ? 0.09290304 : 1),
                0,
              );
              const unit = rooms[0].unit;
              const area = Math.round(
                totalAreaM * (unit === "ft" ? 1 / 0.09290304 : 1),
              );
              return (
                <article key={project.id} className="design-card">
                  <button
                    className="design-open"
                    aria-label={`Open ${project.name}`}
                    onClick={() => {
                      useStore.getState().openProject(project.id);
                      onOpen();
                    }}
                  >
                    <DesignPreview doc={project.doc} />
                    <span className="open-arrow">
                      <ArrowUpRight size={20} />
                    </span>
                  </button>
                  <div className="design-card-details">
                    <div className="min-w-0">
                      <h3>
                        <button
                          onClick={() => {
                            useStore.getState().openProject(project.id);
                            onOpen();
                          }}
                        >
                          {project.name}
                        </button>
                      </h3>
                      <p>
                        {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
                        <span>·</span>
                        {area} {unit === "ft" ? "ft²" : "m²"}
                        <span>·</span>
                        {new Date(project.updatedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </p>
                    </div>
                    <Menu
                      trigger={
                        <IconButton
                          aria-label={`Options for ${project.name}`}
                          icon={<DotsThree size={22} weight="bold" />}
                        />
                      }
                      items={[
                        {
                          key: "rename",
                          label: "Rename",
                          onSelect: () => {
                            setRenameId(project.id);
                            setName(project.name);
                          },
                        },
                        {
                          key: "duplicate",
                          label: "Duplicate",
                          onSelect: () => {
                            useStore.getState().duplicateProject(project.id);
                          },
                        },
                        {
                          key: "download",
                          label: "Download backup",
                          onSelect: () =>
                            downloadDesign(project.doc, project.name),
                        },
                        {
                          key: "delete",
                          label: "Delete",
                          onSelect: () => setDeleteId(project.id),
                        },
                      ]}
                    />
                  </div>
                </article>
              );
            })}
            {!search && (
              <button
                className="new-design-card"
                onClick={() => chooseTemplate("empty")}
              >
                <span>
                  <Plus size={26} />
                </span>
                New design
              </button>
            )}
          </div>
          {filtered.length === 0 && search && (
            <div className="library-empty">
              <MagnifyingGlass size={28} />
              <p>No designs found</p>
              <Button variant="ghost" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </div>
          )}
        </section>
      </main>

      <Dialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New design"
        maxWidthClassName="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const store = useStore.getState();
            const count = store.projects.length;
            store.createProject(name.trim(), createFromTemplate(template));
            if (useStore.getState().projects.length === count) return;
            setNewOpen(false);
            onOpen();
          }}
        >
          <label className="field-label" htmlFor="design-name">
            Name
          </label>
          <input
            id="design-name"
            className="text-input"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="new-template-grid">
            {previews.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`new-template ${template === t.id ? "selected" : ""}`}
                aria-pressed={template === t.id}
                onClick={() => {
                  setTemplate(t.id);
                  if (
                    ROOM_TEMPLATES.some((p) => p.name === name) ||
                    name === "Untitled design"
                  )
                    setName(t.id === "empty" ? "Untitled design" : t.name);
                }}
              >
                <DesignPreview doc={t.doc} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNewOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              Create design
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={renameId !== null}
        onClose={() => setRenameId(null)}
        title="Rename design"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renameId && name.trim())
              useStore.getState().renameProject(renameId, name.trim());
            setRenameId(null);
          }}
        >
          <label className="field-label" htmlFor="rename-name">
            Name
          </label>
          <input
            id="rename-name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            autoFocus
          />
          <div className="dialog-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRenameId(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete design?"
        footer={
          <>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteId) useStore.getState().deleteProject(deleteId);
                setDeleteId(null);
              }}
            >
              Delete design
            </Button>
          </>
        }
      >
        <p>{projects.find((p) => p.id === deleteId)?.name}</p>
      </Dialog>
    </div>
  );
}
