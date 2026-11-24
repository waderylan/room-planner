import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DesignLibrary } from "./components/DesignLibrary";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastStack } from "./components/ui/ToastStack";
import { useStore } from "./store/store";
import { useInventoryStore } from "./inventory/inventoryStore";
import type { ConfirmedProduct } from "./productImport/types";
import { ShareDialog } from "./components/Sharing/ShareDialog";
import type { Project } from "./store/persistence";

const App = lazy(() => import("./App"));
const InventoryPage = lazy(() =>
  import("./components/Inventory/InventoryPage").then((module) => ({
    default: module.InventoryPage,
  })),
);
const ComparePage = lazy(() =>
  import("./components/Compare/ComparePage").then((module) => ({
    default: module.ComparePage,
  })),
);
const SharedLayoutPage = lazy(() =>
  import("./components/Sharing/SharedLayoutPage").then((module) => ({
    default: module.SharedLayoutPage,
  })),
);
const ProductImportDialog = lazy(() =>
  import("./components/ProductImport/ProductImportDialog").then((module) => ({
    default: module.ProductImportDialog,
  })),
);

export function Root() {
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState<Project[] | null>(null);
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
  const toDesigns = () => {
    window.location.hash = "designs";
  };
  const openDesign = () => {
    window.location.hash = `design/${useStore.getState().activeProjectId}`;
  };
  function saveProduct(product: ConfirmedProduct) {
    const entry = useInventoryStore
      .getState()
      .saveEntry({
        name: product.name,
        footprint: { kind: "rect", w: product.widthM, d: product.depthM },
        height: product.heightM,
        elevation: 0,
        color: "#8a8f98",
        quantity: 1,
        ...(product.sourceUrl
          ? {
              source: {
                url: product.sourceUrl,
                ...(product.sku ? { sku: product.sku } : {}),
                ...(product.brand ? { brand: product.brand } : {}),
              },
            }
          : {}),
      });
    if (entry)
      useStore
        .getState()
        .pushToast(`Saved ${entry.name} to My furniture.`, "success");
    return !!entry;
  }
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
      editor && project
        ? `${project.name} · Room Planner`
        : route === "#furniture"
          ? "My furniture · Room Planner"
          : route === "#compare"
            ? "Compare apartments · Room Planner"
            : route.startsWith("#share/")
              ? "Shared layouts · Room Planner"
              : "Room Planner";
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
        {route === "#furniture" ? (
          <InventoryPage
            onBack={toDesigns}
            onImportLink={() => setImporting(true)}
          />
        ) : route === "#compare" ? (
          <ComparePage
            onBack={toDesigns}
            onOpenDesign={openDesign}
            onShare={setSharing}
          />
        ) : route.startsWith("#share/") ? (
          <SharedLayoutPage
            shareId={route.slice(7)}
            onBack={toDesigns}
            onOpenDesign={openDesign}
          />
        ) : editor ? (
          <App
            onBackToLanding={() => {
              useStore.getState().flushSave();
              window.location.hash = "designs";
            }}
          />
        ) : (
          <DesignLibrary onOpen={openDesign} />
        )}
      </Suspense>
      {importing && (
        <Suspense fallback={null}>
          <ProductImportDialog
            open
            onClose={() => setImporting(false)}
            onSave={saveProduct}
          />
        </Suspense>
      )}
      <ShareDialog
        open={sharing !== null}
        onClose={() => setSharing(null)}
        projects={sharing ?? []}
      />
      <ToastStack />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
