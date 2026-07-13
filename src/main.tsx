import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { runGeometrySelfTest } from "./geometry/selfTest";

if (import.meta.env.DEV) {
  runGeometrySelfTest();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
