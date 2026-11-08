import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./boot.css";

const WorldApp = lazy(() =>
  import("./WorldApp").then((m) => ({ default: m.WorldApp })),
);

const root = document.getElementById("world-root");
if (!root) throw new Error("Missing #world-root");

createRoot(root).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="world-boot" role="status">
          <p className="world-boot-brand">
            boing<span>pets</span>
          </p>
          <p>Loading Starter Town…</p>
          <a href="/">← Back to pasture</a>
        </div>
      }
    >
      <WorldApp />
    </Suspense>
  </StrictMode>,
);
