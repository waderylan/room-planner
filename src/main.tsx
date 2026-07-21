import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { LandingPage } from "./landing/LandingPage";
import { runGeometrySelfTest } from "./geometry/selfTest";

if (import.meta.env.DEV) {
  runGeometrySelfTest();
}

const ENTERED_KEY = "room-planner:entered";

function readEntered(): boolean {
  // #landing forces the landing page even mid-session (and is cleared on enter)
  if (window.location.hash === "#landing") return false;
  try {
    return sessionStorage.getItem(ENTERED_KEY) === "1";
  } catch {
    return true;
  }
}

function Root() {
  const [entered, setEntered] = useState(readEntered);
  if (entered) {
    return (
      <App
        onBackToLanding={() => {
          try {
            sessionStorage.removeItem(ENTERED_KEY);
          } catch {
            // ignore
          }
          setEntered(false);
        }}
      />
    );
  }
  return (
    <LandingPage
      onEnter={() => {
        try {
          sessionStorage.setItem(ENTERED_KEY, "1");
        } catch {
          // private-mode storage failures just mean the landing shows again next load
        }
        if (window.location.hash === "#landing") {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
        window.scrollTo(0, 0);
        setEntered(true);
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
