import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
      "input, textarea, select, [role=dialog], [role=menu], [contenteditable=true]",
    ) ||
      !!document.querySelector("dialog[open]"))
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
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
  const mobile = useMediaQuery("(max-width: 767px)");
  const compact = useMediaQuery("(max-width: 1023px)");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const assistantRef = useRef<HTMLElement>(null);
  const activePanel =
    mobile && sidebarOpen
      ? "sidebar"
      : compact && chatOpen
        ? "assistant"
        : null;

  useEffect(() => {
    if (!activePanel) return;
    const panel =
      activePanel === "sidebar" ? sidebarRef.current : assistantRef.current;
    if (!panel) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const controls = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ),
      ].filter(
        (element) =>
          element.getClientRects().length && !element.closest("[inert]"),
      );
    (controls()[0] ?? panel).focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || document.querySelector("dialog[open]")) return;
      const elements = controls();
      const first = elements[0],
        last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (
        previous?.isConnected &&
        previous.getClientRects().length &&
        !previous.closest("[inert]")
      )
        previous.focus();
    };
  }, [activePanel]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const store = useStore.getState();
      if (
        e.key === "Escape" &&
        !document.querySelector('dialog[open], [role="menu"]')
      ) {
        if (
          window.matchMedia("(max-width: 767px)").matches &&
          store.sidebarOpen
        ) {
          store.setSidebarOpen(false);
          return;
        }
        if (
          window.matchMedia("(max-width: 1023px)").matches &&
          store.chatOpen
        ) {
          store.setChatOpen(false);
          return;
        }
      }
      const command = e.metaKey || e.ctrlKey;
      if (command && e.key.toLowerCase() === "s") {
        e.preventDefault();
        store.flushSave();
        return;
      }
      // A newly opened menu may still have focus on its trigger until the next frame.
      if (document.querySelector('[role="menu"]') || isTypingTarget(e.target)) return;
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
      <div className="shrink-0" inert={!!activePanel}>
        <Toolbar onBackToLanding={onBackToLanding} />
      </div>
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
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          ref={sidebarRef}
          tabIndex={-1}
          className={`editor-sidebar ${sidebarOpen ? "is-open" : ""}`}
          inert={(mobile && !sidebarOpen) || activePanel === "assistant"}
          aria-hidden={
            (mobile && !sidebarOpen) || activePanel === "assistant" || undefined
          }
        >
          <Sidebar />
        </div>
        <main
          className="editor-workspace"
          aria-label="Room editor"
          inert={!!activePanel}
        >
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
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setChatOpen(false)}
            />
            <aside
              ref={assistantRef}
              tabIndex={-1}
              className="assistant-panel"
              aria-label="Room assistant"
            >
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
