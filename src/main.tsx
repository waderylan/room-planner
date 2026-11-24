import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DesignLibrary } from "./components/DesignLibrary";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastStack } from "./components/ui/ToastStack";
import { useStore } from "./store/store";

const App = lazy(() => import("./App"));

export function Root() {
  const [route, setRoute] = useState(() => {
    const hash = window.location.hash;
    return hash.startsWith("#design/") &&
      !useStore.getState().projects.some((p) => p.id === hash.slice(8))
      ? "#designs"
      : hash;
  });
  const theme = useStore((s) => s.theme);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeProjectName = useStore(
    (s) => s.projects.find((p) => p.id === s.activeProjectId)?.name,
  );
  const editor = route.startsWith("#design/");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const update = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#design/")) {
        const id = hash.slice(8);
        const store = useStore.getState();
        if (store.projects.some((p) => p.id === id)) store.openProject(id);
        else {
          setRoute("#designs");
          window.location.replace("#designs");
          return;
        }
      }
      setRoute(hash);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const project = useStore
      .getState()
      .projects.find((p) => p.id === activeProjectId);
    document.title =
      editor && project ? `${project.name} · Room Planner` : "Room Planner";
    if (
      editor &&
      window.location.hash === route &&
      route !== `#design/${activeProjectId}`
    )
      window.location.replace(`#design/${activeProjectId}`);
  }, [activeProjectId, activeProjectName, editor, route]);
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="view-loading" role="status">
            Opening design…
          </div>
        }
      >
        {editor ? (
          <App
            onBackToLanding={() => {
              useStore.getState().flushSave();
              window.location.hash = "designs";
            }}
          />
        ) : (
          <DesignLibrary
            onOpen={() => {
              window.location.hash = `design/${useStore.getState().activeProjectId}`;
            }}
          />
        )}
      </Suspense>
      <ToastStack />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
