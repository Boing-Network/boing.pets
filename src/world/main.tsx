import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorldApp } from "./WorldApp";

const root = document.getElementById("world-root");
if (!root) throw new Error("Missing #world-root");

createRoot(root).render(
  <StrictMode>
    <WorldApp />
  </StrictMode>,
);
