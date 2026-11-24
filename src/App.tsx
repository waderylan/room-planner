import { lazy, Suspense, useEffect, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { useStore } from "./store/store";
import { Toolbar } from "./components/Toolbar";
import { RoomTabs } from "./components/RoomTabs";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Canvas2D } from "./components/Canvas2D/Canvas2D";
import { SettingsDialog } from "./components/Settings/SettingsDialog";
import { Button } from "./components/ui/Button";
import { ErrorBoundary } from "./components/ErrorBoundary";

const View3D = lazy(() =>
  import("./components/View3D/View3D").then((m) => ({ default: m.View3D })),
);
const ChatPanel = lazy(() =>
  import("./components/Chat/ChatPanel").then((m) => ({ default: m.ChatPanel })),
);

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (!!target.closest(
      "input, textarea, select, [role=dialog], [contenteditable=true]",
    ) ||
      !!document.querySelector("dialog[open]"))
  );
}

function App({ onBackToLanding }: { onBackToLanding?: () => void }) {
  const viewMode = useStore((s) => s.viewMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const roomId = useStore((s) => s.doc.activeRoomId);
  const projectId = useStore((s) => s.activeProjectId);
  const saveStatus = useStore((s) => s.saveStatus);
  const saveError = useStore((s) => s.saveError);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const store = useStore.getState();
      const command = e.metaKey || e.ctrlKey;
      if (command && e.key.toLowerCase() === "s") {
        e.preventDefault();
        store.flushSave();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (
        command &&
        (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        if (e.shiftKey || e.key.toLowerCase() === "y") store.redo();
        else store.undo();
        return;
      }
      const room = store.activeRoom();
      const selectedId = room.selectedItemId;
      if (e.key === "Escape") {
        if (selectedId) store.selectItem(null);
        return;
      }
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.deleteItem(selectedId);
      } else if (e.key.toLowerCase() === "r" && !command) {
        const item = room.items.find((it) => it.id === selectedId);
        if (item) store.rotateItem(selectedId, item.rotDeg + 90);
      } else if (command && e.key.toLowerCase() === "d") {
        e.preventDefault();
        store.duplicateItem(selectedId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="editor-shell">
      <Toolbar onBackToLanding={onBackToLanding} />
      {saveStatus === "error" && (
        <div className="save-error" role="alert">
          <WarningCircle size={18} />
          <span>{saveError}</span>
          <Button size="sm" onClick={() => useStore.getState().flushSave()}>
            Retry
          </Button>
          <Button size="sm" onClick={() => useStore.getState().exportDoc()}>
            Download backup
          </Button>
        </div>
      )}
      <div className="editor-body">
        {sidebarOpen && (
          <button
            aria-label="Close sidebar"
            className="mobile-backdrop md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className={`editor-sidebar ${sidebarOpen ? "is-open" : ""}`}>
          <Sidebar />
        </div>
        <main className="editor-workspace" aria-label="Room editor">
          <div data-floor-plan className="canvas-area">
            <ErrorBoundary
              key={`${projectId}-${roomId}-${viewMode}`}
              message="This view could not be opened."
              onRecover={() => useStore.getState().setViewMode("2d")}
            >
              <Suspense
                fallback={
                  <div className="view-loading" role="status">
                    Loading 3D view…
                  </div>
                }
              >
                {viewMode === "2d" ? (
                  <Canvas2D key={`${projectId}-${roomId}`} />
                ) : (
                  <View3D key={`${projectId}-${roomId}`} />
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
          <RoomTabs />
        </main>
        {chatOpen && (
          <>
            <button
              aria-label="Close assistant"
              className="mobile-backdrop lg:hidden"
              onClick={() => setChatOpen(false)}
            />
            <aside className="assistant-panel" aria-label="Room assistant">
              <Suspense
                fallback={
                  <div className="view-loading">Loading assistant…</div>
                }
              >
                <ChatPanel
                  key={`${projectId}-${roomId}`}
                  onClose={() => setChatOpen(false)}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              </Suspense>
            </aside>
          </>
        )}
      </div>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
