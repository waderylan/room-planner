import { useEffect, useState } from "react";
import { useStore } from "./store/store";
import { Toolbar } from "./components/Toolbar";
import { RoomTabs } from "./components/RoomTabs";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Canvas2D } from "./components/Canvas2D/Canvas2D";
import { View3D } from "./components/View3D/View3D";
import { ToastStack } from "./components/ui/ToastStack";
import { ChatPanel } from "./components/Chat/ChatPanel";
import { SettingsDialog } from "./components/Settings/SettingsDialog";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

function App() {
  const theme = useStore((s) => s.theme);
  const viewMode = useStore((s) => s.viewMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const room = useStore((s) => s.activeRoom());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectItem = useStore((s) => s.selectItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const rotateItem = useStore((s) => s.rotateItem);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const selectedId = room.selectedItemId;

      if (e.key === "Escape") {
        if (selectedId) selectItem(null);
        return;
      }
      if (!selectedId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteItem(selectedId);
      } else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        const item = room.items.find((it) => it.id === selectedId);
        if (item) rotateItem(selectedId, item.rotDeg + 90);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateItem(selectedId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [room, selectItem, deleteItem, duplicateItem, rotateItem]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div className="flex min-h-0 flex-1">
        <div
          className={
            "fixed inset-0 z-30 bg-black/40 transition-opacity duration-150 md:hidden " +
            (sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0")
          }
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={
            "fixed inset-y-0 left-0 z-40 w-[85vw] max-w-[320px] transition-transform duration-150 md:static md:z-auto md:w-auto md:max-w-none md:translate-x-0 " +
            (sidebarOpen ? "translate-x-0" : "-translate-x-full")
          }
        >
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar />
          <div className="min-h-0 flex-1">{viewMode === "2d" ? <Canvas2D /> : <View3D />}</div>
        </div>

        {chatOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/40 transition-opacity duration-150 md:hidden"
              onClick={() => setChatOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 z-40 w-[90vw] max-w-[340px] md:static md:z-auto md:w-auto md:max-w-none">
              <ChatPanel onClose={() => setChatOpen(false)} onOpenSettings={() => setSettingsOpen(true)} />
            </div>
          </>
        )}
      </div>
      <RoomTabs />
      <ToastStack />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
