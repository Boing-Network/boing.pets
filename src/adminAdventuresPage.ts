import "./style.css";
import "./streetwear.css";
import "./adventures.css";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  ADVENTURE_ADMIN_ACTIONS,
  buildAdventureAdminMessage,
  type AdventureAdminAction,
} from "./content/adventureAdmin";

const app = document.querySelector("#app");
if (!app) throw new Error("missing #app");

let keyBytes: Uint8Array | null = null;
let origin = "https://boing-pets.nico-chikuji.workers.dev";
let lastJson = "";
let status =
  "Operator signature required. Load the local key file to continue.";

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sign(message: string) {
  if (!keyBytes) throw new Error("Load the operator key file first.");
  return (
    "0x" +
    bytesToHex(
      await ed.signAsync(blake3(new TextEncoder().encode(message)), keyBytes),
    )
  );
}

async function adminRequest(
  action: AdventureAdminAction,
  extra: Record<string, unknown> = {},
) {
  if (!keyBytes) {
    status = "Load the operator key file first.";
    render();
    return null;
  }
  const issuedAt = Date.now();
  const message = buildAdventureAdminMessage({ origin, issuedAt, action });
  const signature = await sign(message);
  const res = await fetch("/api/admin/adventures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      issued_at: issuedAt,
      message,
      signature,
      ...extra,
    }),
  });
  const body = await res.json().catch(() => ({ error: "Bad response" }));
  lastJson = JSON.stringify(body, null, 2);
  status = res.ok
    ? `${action} · ok`
    : `${action} · ${res.status}: ${body.error ?? "failed"}`;
  render();
  return res.ok ? body : null;
}

function parseKeyFile(text: string): Uint8Array {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    const maybe =
      cut > 0 && line.slice(0, cut).trim() === "MULTI_TOKEN_ADMIN_SECRET_KEY"
        ? line
            .slice(cut + 1)
            .trim()
            .replace(/^['"]|['"]$/g, "")
        : line;
    const hex = maybe.replace(/^0x/i, "");
    if (/^[0-9a-f]{64}$/i.test(hex)) return hexToBytes(hex);
  }
  throw new Error("That file does not contain a 32-byte operator key.");
}

function render() {
  const locked = !keyBytes;
  app!.innerHTML = `
    <main class="page page-admin-adventures adventure-admin">
      <header class="adventure-admin-head">
        <p class="eyebrow">Operator only</p>
        <h1>Idle Adventures admin</h1>
        <p class="small">Pop-Ups, rate overrides, and analytics. The key stays in this tab and is never shown.</p>
      </header>
      <p class="adventure-admin-status" role="status">${esc(status)}</p>
      <form class="adventure-admin-gate" id="gate">
        <label>
          Operator key file
          <input type="file" id="key-file" accept=".vars,.env,.txt,text/plain" ${locked ? "" : "disabled"} />
        </label>
        <label>
          Message origin (must match worker APP_ORIGIN)
          <input type="url" id="origin" value="${esc(origin)}" />
        </label>
      </form>
      <div class="adventure-admin-actions" role="toolbar" aria-label="Admin actions">
        ${ADVENTURE_ADMIN_ACTIONS.filter(
          (action) => action === "state" || action === "analytics",
        )
          .map(
            (action) =>
              `<button type="button" data-action="${action}" ${locked ? "disabled" : ""}>${action}</button>`,
          )
          .join("")}
      </div>
      <form class="adventure-admin-form" id="popup-form">
        <h2>Worldwide Pop-Up</h2>
        <label>Id <input name="id" placeholder="summer-block-party" ${locked ? "disabled" : ""} /></label>
        <label>Name <input name="name" placeholder="Summer Block Party" ${locked ? "disabled" : ""} /></label>
        <label>Starts (ms) <input name="startsAt" inputmode="numeric" ${locked ? "disabled" : ""} /></label>
        <label>Ends (ms) <input name="endsAt" inputmode="numeric" ${locked ? "disabled" : ""} /></label>
        <label>Pool JSON <textarea name="pool" rows="3" ${locked ? "disabled" : ""}>[{"itemId":"popup-guest-pass","rarity":"rare"}]</textarea></label>
        <div class="adventure-admin-actions">
          <button type="submit" data-kind="create" ${locked ? "disabled" : ""}>Create / update</button>
          <button type="button" data-kind="end" ${locked ? "disabled" : ""}>End event</button>
        </div>
      </form>
      <form class="adventure-admin-form" id="rarity-form">
        <h2>Rarity override</h2>
        <p class="small">Code defaults stay the fallback. Iconic cannot pass the hard ceiling. Pity can never grant Grail or Vaulted.</p>
        <label>Weights JSON <textarea name="weights" rows="4" ${locked ? "disabled" : ""}>{"rare":100000}</textarea></label>
        <label>Note <input name="note" ${locked ? "disabled" : ""} /></label>
        <button type="submit" ${locked ? "disabled" : ""}>Save rarity override</button>
      </form>
      <section class="adventure-admin-output" aria-label="Latest response">
        <h2>Latest response</h2>
        <pre>${esc(lastJson || "No request yet.")}</pre>
      </section>
    </main>
  `;
  document.querySelector("#origin")?.addEventListener("change", (event) => {
    origin = (event.target as HTMLInputElement).value.trim() || origin;
  });
  document
    .querySelector("#key-file")
    ?.addEventListener("change", async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      (event.target as HTMLInputElement).value = "";
      if (!file) return;
      try {
        keyBytes = parseKeyFile(await file.text());
        status = "Key loaded in memory. It will not be displayed.";
      } catch (error) {
        keyBytes = null;
        status =
          error instanceof Error
            ? error.message
            : "Could not read that key file.";
      }
      render();
    });
  app!
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        void adminRequest(button.dataset.action as AdventureAdminAction);
      });
    });
  document.querySelector("#popup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    let pool: unknown[] = [];
    try {
      pool = JSON.parse(String(data.get("pool") || "[]"));
    } catch {
      status = "Pool JSON is invalid.";
      render();
      return;
    }
    void adminRequest("popup-create", {
      event: {
        id: String(data.get("id") || "") || undefined,
        name: String(data.get("name") || ""),
        startsAt: Number(data.get("startsAt")),
        endsAt: Number(data.get("endsAt")),
        pool,
      },
    });
  });
  document
    .querySelector("#popup-form [data-kind='end']")
    ?.addEventListener("click", () => {
      const id = String(
        new FormData(
          document.querySelector("#popup-form") as HTMLFormElement,
        ).get("id") || "",
      );
      void adminRequest("popup-end", { id });
    });
  document
    .querySelector("#rarity-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.target as HTMLFormElement;
      const data = new FormData(form);
      let weights: unknown;
      try {
        weights = JSON.parse(String(data.get("weights") || "{}"));
      } catch {
        status = "Weights JSON is invalid.";
        render();
        return;
      }
      void adminRequest("override-rarity", {
        weights,
        note: String(data.get("note") || ""),
      });
    });
}

render();
