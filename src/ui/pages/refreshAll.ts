import { api, app, type ViewPet } from "../appRuntime";
import type { PageId } from "../nav";
import {
  controls,
  refreshBuddyCard,
  refreshPastureGallery,
} from "./pasturePage";

export async function refresh(page: PageId) {
  if (page === "pasture") {
    await refreshBuddyCard();
    await refreshPastureGallery();
    await refreshOpenActivityOverlay();
  } else if (app.owner || page === "friends") {
    // Keep buddy vitals fresh when serving snacks / care-adjacent pages.
    if (["kitchen", "home", "market", "quests"].includes(page) && app.owner)
      app.mine = (
        await api<{ pet: ViewPet | null }>("/api/pet?owner=" + app.owner)
      ).pet;
  }
  if (page === "market") {
    const { refreshEconomy } = await import("./progressPage");
    await refreshEconomy().catch(() => {
      /* economy tables may be missing until migration 0004 */
    });
  }
  if (page === "quests") {
    const { refreshQuests } = await import("./progressPage");
    await refreshQuests().catch(() => {
      /* content tables may be missing until migration 0005 */
    });
  }
  if (page === "collections") {
    const { refreshCollections } = await import("./progressPage");
    await refreshCollections().catch(() => {
      /* content tables may be missing until migration 0005 */
    });
  }
  if (page === "friends") {
    const { refreshSocial } = await import("./socialPage");
    await refreshSocial().catch(() => {
      /* social tables may be missing until migration 0006 */
    });
  }
  if (page === "fishing") {
    const { refreshFishing } = await import("./activitiesPage");
    await refreshFishing().catch(() => {
      /* fishing tables may be missing until migration 0008 */
    });
  }
  if (page === "home") {
    const { refreshHousing } = await import("./lifestylePage");
    await refreshHousing().catch(() => {
      /* housing tables may be missing until migration 0009 */
    });
  }
  if (page === "treasure") {
    const { refreshTreasure } = await import("./activitiesPage");
    await refreshTreasure().catch(() => {
      /* treasure tables may be missing until migration 0011 */
    });
  }
  if (page === "garden") {
    const { refreshGarden } = await import("./lifestylePage");
    await refreshGarden().catch(() => {
      /* garden tables may be missing until migration 0013 */
    });
  }
  if (page === "kitchen") {
    const { refreshKitchen } = await import("./lifestylePage");
    await refreshKitchen().catch(() => {
      /* cooking tables may be missing until migration 0014 */
    });
  }
  if (page === "craft") {
    const { refreshCraft } = await import("./craftPage");
    await refreshCraft().catch(() => {
      /* crafting tables may be missing until migration 0027 */
    });
  }
  if (page === "mining") {
    const { refreshMining } = await import("./activitiesPage");
    await refreshMining().catch(() => {
      /* mining tables may be missing until migration 0015 */
    });
    const { refreshOnchainItems } = await import("../onchainItemsPanel");
    await refreshOnchainItems().catch(() => {
      /* on-chain items are optional (migration 0022 + operator config) */
    });
  }
  if (page === "racing") {
    const { refreshRacing } = await import("./activitiesPage");
    await refreshRacing().catch(() => {
      /* racing tables may be missing until migration 0016 */
    });
  }
  controls();
}

/** Re-bind and refresh an in-pasture activity overlay if its panel is mounted. */
export async function refreshOpenActivityOverlay() {
  const jobs: Array<Promise<unknown>> = [];
  if (document.getElementById("fishing-summary")) {
    jobs.push(import("./activitiesPage").then((m) => m.refreshFishing()));
  }
  if (document.getElementById("mining-summary")) {
    jobs.push(import("./activitiesPage").then((m) => m.refreshMining()));
  }
  if (document.getElementById("treasure-summary")) {
    jobs.push(import("./activitiesPage").then((m) => m.refreshTreasure()));
  }
  if (document.getElementById("racing-summary")) {
    jobs.push(import("./activitiesPage").then((m) => m.refreshRacing()));
  }
  if (document.getElementById("garden-summary")) {
    jobs.push(import("./lifestylePage").then((m) => m.refreshGarden()));
  }
  if (document.getElementById("kitchen-summary")) {
    jobs.push(import("./lifestylePage").then((m) => m.refreshKitchen()));
  }
  if (!jobs.length) return;
  await Promise.all(jobs.map((job) => job.catch(() => undefined)));
}
