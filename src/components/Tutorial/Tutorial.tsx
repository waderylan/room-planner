import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../../store/store";
import { Button } from "../ui/Button";
import { Sparkle, X } from "@phosphor-icons/react";

const STORAGE_KEY = "room-planner:tour-done";

interface Step {
  /** CSS selector for the element to spotlight; null centers the card (welcome). */
  target: string | null;
  title: string;
  body: string;
  /** Preferred side of the target to place the card on. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Run when the step becomes active (e.g. open the sidebar so its target is visible). */
  onEnter?: () => void;
}

const CARD_WIDTH = 320;
const GAP = 14; // space between the spotlight and the card
const PAD = 8; // spotlight padding around the target

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Clamp a value into [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function Tutorial() {
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const active = useStore((s) => s.tourOpen);
  const setTourOpen = useStore((s) => s.setTourOpen);

  const steps: Step[] = [
    {
      target: null,
      title: "Welcome to Room Planner",
      body: "Lay out a room to scale, drag furniture into place, and step into a 3D view — or let the AI assistant do it for you. Here's a 30-second tour.",
    },
    {
      target: '[data-tour="room"]',
      title: "Set up your room",
      body: "Start here: set the width, length, and units, switch to an L-shape, or add alcoves, windows, and doors.",
      placement: "right",
      onEnter: () => setSidebarOpen(true),
    },
    {
      target: '[data-tour="furniture"]',
      title: "Add furniture",
      body: "Drop in pieces from the preset catalog — bed, sofa, desk, and more — or add a custom shape to edit from scratch.",
      placement: "right",
      onEnter: () => setSidebarOpen(true),
    },
    {
      target: '[data-tour="canvas"]',
      title: "Arrange your layout",
      body: "Drag furniture to move it; rotate with the handle or the R key. Anything overlapping or out of bounds turns red automatically.",
      placement: "left",
    },
    {
      target: '[data-tour="view"]',
      title: "2D and 3D",
      body: "Switch between the flat floor plan and a 3D view you can orbit around or walk through in first person.",
      placement: "bottom",
    },
    {
      target: '[data-tour="assistant"]',
      title: "The AI assistant",
      body: 'Short on time? Ask the assistant to design for you — e.g. "furnish this as a cozy bedroom" — and it places everything for you.',
      placement: "bottom",
    },
    {
      target: '[data-tour="settings"]',
      title: "Connect the assistant",
      body: "The assistant needs an API key. Add one for Anthropic, OpenAI, or Gemini here — it's stored only in your browser.",
      placement: "bottom",
    },
    {
      target: '[data-tour="rooms"]',
      title: "Rooms & saving",
      body: "Plan multiple rooms in these tabs. Your work autosaves as you go, and Save / Load exports the whole plan as a file.",
      placement: "top",
    },
  ];

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(200);

  // Show once per browser, on first visit. On-demand launches come from the
  // toolbar via setTourOpen(true).
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setTourOpen(true);
    } catch {
      /* ignore storage errors */
    }
  }, [setTourOpen]);

  // Always start from the beginning each time the tour opens.
  useEffect(() => {
    if (active) setIndex(0);
  }, [active]);

  const step = steps[index];

  // Run the step's onEnter side-effect, then measure its target (re-measuring a
  // few times so it catches the sidebar/drawer opening animation).
  useLayoutEffect(() => {
    if (!active) return;
    step.onEnter?.();
    // Scroll the target into view (e.g. inside the scrollable left sidebar) so
    // the spotlight and card land on-screen. Only on step entry, not on every
    // scroll/resize, to avoid a scroll feedback loop.
    const bring = () => {
      if (!step.target) return;
      document.querySelector(step.target)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    const measure = () => setRect(readRect(step.target));
    bring();
    measure();
    const timers = [
      setTimeout(() => {
        bring();
        measure();
      }, 60),
      setTimeout(() => {
        bring();
        measure();
      }, 220),
    ];
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Measure the card height per step so we can clamp it fully on-screen.
  useLayoutEffect(() => {
    if (!active) return;
    const h = cardRef.current?.offsetHeight;
    if (h) setCardH(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setTourOpen(false);
    setSidebarOpen(false);
  }

  function next() {
    if (index >= steps.length - 1) {
      // Leave the assistant open at the end so it's ready to try.
      setChatOpen(true);
      finish();
    } else {
      setIndex((i) => i + 1);
    }
  }

  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  if (!active) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isLast = index === steps.length - 1;

  // Card position: explicit top/left (no transforms) so we can clamp both axes
  // fully into the viewport. Centered when there's no target; otherwise beside
  // the spotlight on the requested side, flipping/falling back as space allows.
  const margin = 12;
  const maxTop = Math.max(margin, vh - cardH - margin);
  const maxLeft = Math.max(margin, vw - CARD_WIDTH - margin);
  let cardTop: number;
  let cardLeft: number;

  if (!rect) {
    cardTop = (vh - cardH) / 2;
    cardLeft = (vw - CARD_WIDTH) / 2;
  } else {
    const placement = step.placement ?? "bottom";
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rBottom = rect.top + rect.height;
    const rRight = rect.left + rect.width;

    if (placement === "top" && rect.top - PAD - GAP - cardH >= margin) {
      cardTop = rect.top - PAD - GAP - cardH;
      cardLeft = cx - CARD_WIDTH / 2;
    } else if (placement === "right" && rRight + PAD + GAP + CARD_WIDTH <= vw - margin) {
      cardLeft = rRight + PAD + GAP;
      cardTop = cy - cardH / 2;
    } else if (placement === "left" && rect.left - PAD - GAP - CARD_WIDTH >= margin) {
      cardLeft = rect.left - PAD - GAP - CARD_WIDTH;
      cardTop = cy - cardH / 2;
    } else if (rBottom + PAD + GAP + cardH <= vh - margin) {
      // Default / fallback: below the target.
      cardTop = rBottom + PAD + GAP;
      cardLeft = cx - CARD_WIDTH / 2;
    } else {
      // No room below either: place above.
      cardTop = rect.top - PAD - GAP - cardH;
      cardLeft = cx - CARD_WIDTH / 2;
    }
  }

  cardTop = clamp(cardTop, margin, maxTop);
  cardLeft = clamp(cardLeft, margin, maxLeft);

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Click-blocker: swallows interaction with the app while the tour is open. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Spotlight: dims everything except the target via a huge box-shadow. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[10px] transition-all duration-200 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            outline: "2px solid var(--accent)",
            outlineOffset: "2px",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/55" />
      )}

      {/* Card */}
      <div
        ref={cardRef}
        className="absolute flex flex-col gap-3 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-xl"
        style={{ top: cardTop, left: cardLeft, width: CARD_WIDTH, maxHeight: vh - margin * 2 }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[var(--accent)]">
            <Sparkle size={16} weight="fill" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Step {index + 1} of {steps.length}
            </span>
          </div>
          <button
            aria-label="Skip tour"
            onClick={finish}
            className="-mr-1 -mt-1 rounded p-1 text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-[var(--text)]">{step.title}</h3>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">{step.body}</p>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={
                  "h-1.5 rounded-full transition-all duration-200 " +
                  (i === index ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-[var(--border-strong)]")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {index === 0 ? (
              <Button size="sm" variant="ghost" onClick={finish}>
                Skip
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={back}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={next}>
              {isLast ? "Get started" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
