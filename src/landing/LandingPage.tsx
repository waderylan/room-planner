import { useEffect, useMemo, useRef, useState } from "react";
import { PixelScene } from "./PixelScene";
import { PHASE } from "./timeline";
import "./landing.css";

/** PlayStation cross face-button glyph. */
function XGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden shapeRendering="crispEdges">
      <circle cx="12" cy="12" r="10.4" fill="#0a0a0c" stroke="#f4f4f4" strokeWidth="1.6" />
      <path
        d="M7.8 7.8 L16.2 16.2 M16.2 7.8 L7.8 16.2"
        stroke="#8ab4e8"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** PlayStation circle face-button glyph. */
function OGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden shapeRendering="crispEdges">
      <circle cx="12" cy="12" r="10.4" fill="#0a0a0c" stroke="#f4f4f4" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5.2" fill="none" stroke="#e8442e" strokeWidth="2.4" />
    </svg>
  );
}

const BOOT_TEXT = "ROOM PLANNER";

function Boot({ onDone }: { onDone: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 55);
    return () => window.clearInterval(id);
  }, []);
  const done = tick > BOOT_TEXT.length + 8;
  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);
  return (
    <div className="landing-boot">
      <h1>{BOOT_TEXT.slice(0, tick)}</h1>
      {tick > BOOT_TEXT.length + 2 && <div className="landing-boot-check">MEMORY CARD CHECK · OK</div>}
    </div>
  );
}

export interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const [boot, setBoot] = useState(true);
  const [phase, setPhase] = useState(0);
  const progressTarget = useRef(0);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      progressTarget.current = p;
      setPhase(
        p < PHASE.floorB ? 0 : p < PHASE.wallsB ? 1 : p < PHASE.buildB ? 2 : p < PHASE.finale ? 3 : 4,
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "x" || k === "enter") {
        onEnter();
      } else if (k === "o") {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnter]);

  return (
    <div className="landing">
      <div className="landing-stage">
        <PixelScene progressTarget={progressTarget} mouse={mouse} reduced={reduced} />
      </div>

      <div className="landing-title">ROOM PLANNER</div>

      <div className="landing-spacer" style={{ height: "600vh" }} />

      {phase === 0 && (
        <div className="landing-hero">
          <div>
            <h1>
              ROOM
              <br />
              PLANNER
            </h1>
            <p className="landing-scrollhint blink">▼</p>
          </div>
        </div>
      )}

      {phase === 4 && (
        <div className="landing-finale">
          <div className="landing-ready blink">READY?</div>
          <button className="landing-continue" onClick={onEnter}>
            <XGlyph />
            CONTINUE
          </button>
        </div>
      )}

      <div className="landing-legend">
        {phase < 4 ? (
          <>
            <button onClick={onEnter}>
              <XGlyph size={16} /> SKIP
            </button>
            <span>SCROLL ▼</span>
          </>
        ) : (
          <>
            <button onClick={onEnter}>
              <XGlyph size={16} /> ENTER
            </button>
            <button onClick={() => window.scrollTo(0, 0)}>
              <OGlyph size={16} /> TOP
            </button>
          </>
        )}
      </div>

      <div className="landing-vignette" />
      <div className="landing-scanlines" />
      {boot && <Boot onDone={() => setBoot(false)} />}
    </div>
  );
}
