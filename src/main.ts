import { petSvg, traits, type Action } from "./core";
import "./style.css";
import { FOOTER_HTML, PAGE_BODIES } from "./ui/pageBodies";
import { PAGE_META, renderHeader, type PageId } from "./ui/nav";
import {
  applyLegacyHashRedirect,
  readPageId,
  wireNavDropdowns,
} from "./ui/navDom";
import { clearWalletSession, requestWalletSession } from "./wallet/session";
import { api, app, $, on, notice } from "./ui/appRuntime";
import {
  act,
  assertWallet,
  attachRestoredSession,
  bindWallet,
  confirmPending,
  disconnect,
  run,
  setCareHooks,
} from "./ui/careActions";
import { refresh } from "./ui/pages/refreshAll";
import { controls } from "./ui/pages/pasturePage";
import { economyAct } from "./ui/pages/progressPage";
import {
  castLine,
  finishRace,
  reelIn,
  startRace,
  startTreasureDig,
  strikeVein,
  swingPick,
} from "./ui/pages/activitiesPage";
import { housingAct } from "./ui/pages/lifestylePage";
import { socialAct } from "./ui/pages/socialPage";

function showOnboardingTip() {
  if (localStorage.getItem("boing-pets-onboarded")) return;
  if (page !== "pasture") return;
  const tips = [
    "Tip: Hatch once with a tiny self-transfer, then say hello daily for streaks.",
    "Tip: Play and Groom are free signatures once per UTC day.",
    "Tip: Form a party with friends — shared activities earn a Party bonus.",
    "Tip: Try fishing, mining, racing, and cooking for variety-day Boinglets.",
  ];
  const tip = tips[Math.floor(Date.now() / 60_000) % tips.length];
  const el = document.querySelector("#onboarding-tip");
  if (el) el.textContent = tip;
  else {
    const banner = document.createElement("p");
    banner.id = "onboarding-tip";
    banner.className = "subtle";
    banner.textContent = tip;
    document.querySelector("main.page")?.prepend(banner);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "quiet";
  dismiss.textContent = "Got it";
  dismiss.onclick = () => {
    localStorage.setItem("boing-pets-onboarded", "1");
    document.querySelector("#onboarding-tip")?.remove();
    dismiss.remove();
  };
  if (!document.querySelector("#onboarding-dismiss")) {
    dismiss.id = "onboarding-dismiss";
    document.querySelector("main.page")?.prepend(dismiss);
  }
}

setCareHooks({
  refresh: () => refresh(page),
  controls,
});

applyLegacyHashRedirect();
const page: PageId = readPageId();
document.title = PAGE_META[page].docTitle;
const body = PAGE_BODIES[page] || PAGE_BODIES.pasture;
$("#app").innerHTML =
  `${renderHeader(page)}<main class="page page-${page}">${body}</main>${FOOTER_HTML}`;
wireNavDropdowns();
showOnboardingTip();
if (page === "pasture") {
  const demoOwner = "0x" + "11".repeat(32);
  const hero = document.querySelector("#hero-pets");
  if (hero) {
    hero.innerHTML = [1, 2, 3]
      .map(
        (i) =>
          `<div>${petSvg(traits(demoOwner, "0x" + String(i).repeat(64)))}</div>`,
      )
      .join("");
  }
}

on(
  "#connect",
  "click",
  () =>
    void run(async () => {
      if (app.owner) {
        notice("Already connected. Use Disconnect to change wallets.");
        return;
      }
      const session = await requestWalletSession();
      bindWallet(session);
      try {
        await assertWallet();
      } catch (e) {
        clearWalletSession(app.provider);
        app.owner = "";
        app.provider = null;
        throw e;
      }
      await refresh(page);
      notice("Connected on Boing testnet. Your pasture awaits.");
    }),
);
on("#disconnect", "click", () => disconnect());
for (const action of ["hatch", "feed", "checkin", "play", "groom"] as Action[])
  on("#" + action, "click", () => void run(() => act(action)));
on("#retry", "click", () => void run(confirmPending));
on("#forget", "click", () => {
  if (app.busy) return;
  if (
    window.confirm(
      "This only forgets the local record; it does NOT cancel a submitted transaction or refund fees. If still pending, try confirming first. Forget it?",
    )
  ) {
    localStorage.removeItem("boing-pets-pending");
    controls();
    notice(
      "Local pending record forgotten. This does not cancel the chain transaction.",
    );
  }
});
on("#claim", "click", () => void run(() => economyAct("claim")));
on(
  "#claim-sparkles",
  "click",
  () => void run(() => economyAct("sparkles_claim")),
);
on("#fish-cast", "click", () => void run(castLine));
on("#mine-swing", "click", () => void run(swingPick));
on("#mine-strike", "click", () => void run(strikeVein));
on("#race-start", "click", () => void run(startRace));
on("#race-finish", "click", () => void run(finishRace));
on("#fish-reel", "click", () => void run(reelIn));
on("#treasure-start", "click", () => void run(startTreasureDig));
on(
  "#home-visibility",
  "click",
  () =>
    void run(async () => {
      const data = await api<{ plot: { visibility: string } | null }>(
        `/api/housing/plot?owner=${app.owner}&viewer=${app.owner}`,
      );
      const nextVis = data.plot?.visibility === "public" ? "private" : "public";
      await housingAct("set_visibility", { visibility: nextVis });
    }),
);
on(
  "#save-profile",
  "click",
  () =>
    void run(() =>
      socialAct("set_profile", {
        display_name: ($("#display-name") as HTMLInputElement).value,
      }),
    ),
);
on(
  "#add-friend",
  "click",
  () =>
    void run(() =>
      socialAct("friend_request", {
        target: ($("#friend-wallet") as HTMLInputElement).value.trim(),
      }),
    ),
);
on("#party-create", "click", () => void run(() => socialAct("party_create")));
on("#party-leave", "click", () => void run(() => socialAct("party_leave")));
on(
  "#dm-send",
  "click",
  () =>
    void run(async () => {
      if (!app.dmTarget) throw new Error("Pick a friend to message");
      await socialAct("send_message", {
        target: app.dmTarget,
        body: ($("#dm-body") as HTMLInputElement).value,
      });
      ($("#dm-body") as HTMLInputElement).value = "";
    }),
);
on(
  "#refresh",
  "click",
  () =>
    void run(async () => {
      await refresh(page);
      notice("Fresh from the pasture.");
    }),
);
on(
  "#next",
  "click",
  () =>
    void run(async () => {
      app.offset = app.next ?? 0;
      await refresh(page);
    }),
);
on(
  "#prev",
  "click",
  () =>
    void run(async () => {
      app.offset = Math.max(0, app.offset - 24);
      await refresh(page);
    }),
);
controls();
void (async () => {
  const restored = await attachRestoredSession().catch(() => false);
  try {
    await refresh(page);
    notice(
      restored
        ? "Express session restored. Activities are ready."
        : page === "pasture"
          ? "Testnet pasture ready. Make yourself at home."
          : `${PAGE_META[page].title} ready.`,
    );
  } catch (e) {
    notice(
      e instanceof Error
        ? e.message
        : "Pasture API unavailable. Start the local Worker (`npm run dev:api`) — see README.",
      true,
    );
  }
})();
