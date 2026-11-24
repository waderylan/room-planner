import { useState } from "react";
import {
  ArrowLeft,
  ArrowCounterClockwise,
  ArrowClockwise,
  Check,
  DownloadSimple,
  DotsThree,
  Keyboard,
  List,
  MagnetStraight,
  Moon,
  Sparkle,
  ShareNetwork,
  Sun,
  Wall,
  WarningCircle,
} from "@phosphor-icons/react";
import { useStore } from "../store/store";
import { Segmented } from "./ui/Segmented";
import { IconButton } from "./ui/IconButton";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Menu } from "./ui/Menu";
import { InlineTextEdit } from "./ui/InlineTextEdit";
import { SettingsDialog } from "./Settings/SettingsDialog";
import { downloadDesign, downloadFloorPlan } from "../lib/files";
import { ShareDialog } from "./Sharing/ShareDialog";

const SHORTCUTS = [
  ["⌘ / Ctrl Z", "Undo"],
  ["⌘ / Ctrl Shift Z", "Redo"],
  ["⌘ / Ctrl D", "Duplicate furniture"],
  ["R", "Rotate 90°"],
  ["Arrow keys", "Move furniture"],
  ["Delete", "Delete furniture"],
  ["Esc", "Deselect"],
  ["Alt + drag", "Ignore grid snap"],
  ["Scroll", "Zoom"],
  ["Space + drag", "Pan"],
];

export function Toolbar({ onBackToLanding }: { onBackToLanding?: () => void }) {
  const state = useStore();
  const project = state.projects.find((p) => p.id === state.activeProjectId)!;
  const [renaming, setRenaming] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const room = state.activeRoom();

  return (
    <>
      <header className="editor-header">
        <div className="editor-identity">
          <IconButton
            aria-label="Back to designs"
            title="Back to designs"
            icon={<ArrowLeft size={19} />}
            onClick={onBackToLanding}
          />
          <span className="header-divider" />
          {renaming ? (
            <InlineTextEdit
              value={project.name}
              onCommit={(name) => state.renameProject(project.id, name)}
              editing
              onStopEditing={() => setRenaming(false)}
              className="w-40"
              aria-label="Design name"
            />
          ) : (
            <button
              className="project-title"
              aria-label={`Rename ${project.name}`}
              title="Rename design"
              onClick={() => setRenaming(true)}
            >
              {project.name}
            </button>
          )}
          <span
            className={`save-status ${state.saveStatus === "error" ? "is-error" : ""}`}
            role="status"
            title={state.saveError || "Saved on this device"}
          >
            {state.saveStatus === "saved" ? (
              <Check size={13} />
            ) : state.saveStatus === "error" ? (
              <WarningCircle size={15} />
            ) : null}
            <span>
              {state.saveStatus === "saved"
                ? "Saved"
                : state.saveStatus === "saving"
                  ? "Saving…"
                  : "Not saved"}
            </span>
          </span>
        </div>
        <div className="editor-view-toggle">
          <Segmented
            options={[
              { value: "2d", label: "2D plan" },
              { value: "3d", label: "3D view" },
            ]}
            value={state.viewMode}
            onChange={state.setViewMode}
          />
        </div>
        <div className="editor-header-actions">
          <IconButton
            aria-label="Undo"
            title="Undo (Ctrl Z)"
            disabled={!state.historyPast.length}
            icon={<ArrowCounterClockwise size={18} />}
            onClick={state.undo}
          />
          <IconButton
            aria-label="Redo"
            title="Redo (Ctrl Shift Z)"
            disabled={!state.historyFuture.length}
            icon={<ArrowClockwise size={18} />}
            onClick={state.redo}
          />
          <span className="header-divider hidden sm:block" />
          <IconButton
            aria-label={
              state.theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            icon={
              state.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />
            }
            onClick={state.toggleTheme}
            className="hidden sm:inline-flex"
          />
          <Menu
            trigger={
              <IconButton
                aria-label="Design options"
                icon={<DotsThree size={21} weight="bold" />}
              />
            }
            items={[
              {
                key: "shortcuts",
                label: "Keyboard shortcuts",
                onSelect: () => setHelpOpen(true),
              },
              {
                key: "settings",
                label: "Assistant settings",
                onSelect: () => setSettingsOpen(true),
              },
              {
                key: "theme",
                label:
                  state.theme === "dark"
                    ? "Light appearance"
                    : "Dark appearance",
                onSelect: state.toggleTheme,
              },
            ]}
          />
          <Button size="sm" icon={<ShareNetwork size={16} />} onClick={() => setShareOpen(true)} className="share-button">Share</Button>
          <Menu
            trigger={
              <Button
                size="sm"
                icon={<DownloadSimple size={16} />}
                className="export-button"
              >
                Export
              </Button>
            }
            items={[
              {
                key: "backup",
                label: "Design backup (JSON)",
                onSelect: () =>
                  downloadDesign(useStore.getState().doc, project.name),
              },
              {
                key: "plan",
                label: "Floor plan (SVG)",
                onSelect: () =>
                  downloadFloorPlan(
                    project.name,
                    useStore.getState().activeRoom(),
                  ),
              },
            ]}
          />
        </div>
      </header>
      <div className="editor-tools">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton
            aria-label="Toggle sidebar"
            active={state.sidebarOpen}
            icon={<List size={19} />}
            onClick={() => state.setSidebarOpen(!state.sidebarOpen)}
            className="md:hidden"
          />
          <span className="active-room-name">{room.name}</span>
          <span className="header-divider" />
          {state.viewMode === "2d" ? (
            <>
              {room.selectedItemId && (
                <>
                  <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
                    Measure to
                  </span>
                  <Segmented
                    aria-label="Measure clearance to"
                    options={[
                      { value: "wall", label: "Walls" },
                      { value: "furniture", label: "Furniture" },
                    ]}
                    value={room.measureMode}
                    onChange={state.setMeasureMode}
                  />
                </>
              )}
              <IconButton
                aria-label="Toggle grid snap"
                title="Snap to grid"
                active={state.snapEnabled}
                icon={<MagnetStraight size={18} />}
                onClick={state.toggleSnap}
              />
            </>
          ) : (
            <>
              <Segmented
                options={[
                  { value: "orbit", label: "Orbit" },
                  { value: "walk", label: "Walk" },
                ]}
                value={state.cameraMode}
                onChange={state.setCameraMode}
              />
              <IconButton
                aria-label={state.wallsVisible ? "Hide walls" : "Show walls"}
                icon={<Wall size={18} />}
                active={state.wallsVisible}
                onClick={state.toggleWallsVisible}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            aria-label="Keyboard shortcuts"
            icon={<Keyboard size={18} />}
            onClick={() => setHelpOpen(true)}
            className="hidden sm:inline-flex"
          />
          <Button
            size="sm"
            variant={state.chatOpen ? "primary" : "ghost"}
            icon={<Sparkle size={17} />}
            onClick={() => state.setChatOpen(!state.chatOpen)}
          >
            Assistant
          </Button>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} projects={[project]} />
      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Keyboard shortcuts"
      >
        <dl className="shortcut-list">
          {SHORTCUTS.map(([key, description]) => (
            <div key={key}>
              <dt>{description}</dt>
              <dd>
                <kbd>{key}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </>
  );
}
