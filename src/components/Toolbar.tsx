import { useRef, useState } from "react";
import { useStore } from "./../store/store";
import { Segmented } from "./ui/Segmented";
import { IconButton } from "./ui/IconButton";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { SettingsDialog } from "./Settings/SettingsDialog";
import {
  DownloadSimple,
  GameController,
  GearSix,
  Keyboard,
  List,
  MagnetStraight,
  MoonStars,
  Question,
  Sparkle,
  SunDim,
  UploadSimple,
  Wall,
} from "@phosphor-icons/react";

const SHORTCUTS_2D: [string, string][] = [
  ["Drag", "Move selected furniture"],
  ["R", "Rotate 90 degrees"],
  ["Rotation handle", "Free rotate (hold Shift for 1 degree steps)"],
  ["Delete / Backspace", "Delete selected"],
  ["Ctrl / Cmd + D", "Duplicate selected"],
  ["Esc", "Deselect"],
  ["Alt + drag", "Ignore grid snap"],
  ["Scroll", "Zoom"],
  ["Space + drag / middle drag", "Pan"],
];

const SHORTCUTS_WALK: [string, string][] = [
  ["Click canvas", "Lock the mouse to look around"],
  ["W A S D", "Move"],
  ["H", "Raise the camera"],
  ["L", "Lower the camera"],
  ["Esc", "Release the mouse / exit walk mode"],
];

export interface ToolbarProps {
  onBackToLanding?: () => void;
}

export function Toolbar({ onBackToLanding }: ToolbarProps) {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const room = useStore((s) => s.activeRoom());
  const setMeasureMode = useStore((s) => s.setMeasureMode);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const exportDoc = useStore((s) => s.exportDoc);
  const importDoc = useStore((s) => s.importDoc);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const wallsVisible = useStore((s) => s.wallsVisible);
  const toggleWallsVisible = useStore((s) => s.toggleWallsVisible);

  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const setTourOpen = useStore((s) => s.setTourOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function onLoadClick() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") importDoc(reader.result);
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3">
      <IconButton
        aria-label="Toggle sidebar"
        icon={<List size={18} />}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden"
      />

      <div data-tour="view">
        <Segmented
          options={[
            { value: "2d", label: "2D" },
            { value: "3d", label: "3D" },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
      </div>

      {viewMode === "2d" && (
        <Segmented
          options={[
            { value: "wall", label: "Wall" },
            { value: "furniture", label: "Furniture" },
          ]}
          value={room.measureMode}
          onChange={setMeasureMode}
        />
      )}

      {viewMode === "2d" && (
        <IconButton
          aria-label="Toggle grid snap"
          icon={<MagnetStraight size={16} />}
          active={snapEnabled}
          onClick={toggleSnap}
        />
      )}

      {viewMode === "3d" && (
        <Segmented
          options={[
            { value: "orbit", label: "Orbit" },
            { value: "walk", label: "Walk" },
          ]}
          value={cameraMode}
          onChange={setCameraMode}
        />
      )}

      {viewMode === "3d" && (
        <IconButton
          aria-label={wallsVisible ? "Hide walls" : "Show walls"}
          icon={<Wall size={16} />}
          active={!wallsVisible}
          onClick={toggleWallsVisible}
        />
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {onBackToLanding && (
          <IconButton aria-label="Back to landing page" icon={<GameController size={16} />} onClick={onBackToLanding} />
        )}
        <Button data-tour="save" size="sm" variant="secondary" icon={<DownloadSimple size={14} />} onClick={exportDoc}>
          Save
        </Button>
        <Button size="sm" variant="secondary" icon={<UploadSimple size={14} />} onClick={onLoadClick}>
          Load
        </Button>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onFileChange} />

        <IconButton
          aria-label="Take the tour"
          icon={<Question size={16} />}
          onClick={() => setTourOpen(true)}
        />
        <IconButton
          aria-label="Keyboard shortcuts"
          icon={<Keyboard size={16} />}
          onClick={() => setHelpOpen(true)}
        />
        <IconButton
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          icon={theme === "dark" ? <SunDim size={16} /> : <MoonStars size={16} />}
          onClick={toggleTheme}
        />
        <IconButton data-tour="settings" aria-label="AI assistant settings" icon={<GearSix size={16} />} onClick={() => setSettingsOpen(true)} />
        <Button
          data-tour="assistant"
          size="sm"
          variant={chatOpen ? "primary" : "secondary"}
          icon={<Sparkle size={14} />}
          onClick={() => setChatOpen(!chatOpen)}
        >
          Assistant
        </Button>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              2D editor
            </h3>
            <ShortcutList items={SHORTCUTS_2D} />
          </div>
          <div>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              3D walk mode
            </h3>
            <ShortcutList items={SHORTCUTS_WALK} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ShortcutList({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map(([key, desc]) => (
        <li key={key} className="flex items-center justify-between gap-3 text-xs">
          <span className="rounded border border-[var(--border)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[var(--text)]">
            {key}
          </span>
          <span className="text-right text-[var(--text-muted)]">{desc}</span>
        </li>
      ))}
    </ul>
  );
}
