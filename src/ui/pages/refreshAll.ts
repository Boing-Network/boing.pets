import { api, app, type ViewPet } from "../appRuntime";
import type { PageId } from "../nav";
import { refreshSocial } from "./socialPage";
import {
  refreshFishing,
  refreshMining,
  refreshRacing,
  refreshTreasure,
} from "./activitiesPage";
import { refreshGarden, refreshHousing, refreshKitchen } from "./lifestylePage";
import { refreshCraft } from "./craftPage";
import {
  refreshCollections,
  refreshEconomy,
  refreshQuests,
} from "./progressPage";
import {
  controls,
  refreshBuddyCard,
  refreshPastureGallery,
} from "./pasturePage";
import { refreshOnchainItems } from "../onchainItemsPanel";

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
  if (page === "market")
    await refreshEconomy().catch(() => {
      /* economy tables may be missing until migration 0004 */
    });
  if (page === "quests")
    await refreshQuests().catch(() => {
      /* content tables may be missing until migration 0005 */
    });
  if (page === "collections")
    await refreshCollections().catch(() => {
      /* content tables may be missing until migration 0005 */
    });
  if (page === "friends")
    await refreshSocial().catch(() => {
      /* social tables may be missing until migration 0006 */
    });
  if (page === "fishing")
    await refreshFishing().catch(() => {
      /* fishing tables may be missing until migration 0008 */
    });
  if (page === "home")
    await refreshHousing().catch(() => {
      /* housing tables may be missing until migration 0009 */
    });
  if (page === "treasure")
    await refreshTreasure().catch(() => {
      /* treasure tables may be missing until migration 0011 */
    });
  if (page === "garden")
    await refreshGarden().catch(() => {
      /* garden tables may be missing until migration 0013 */
    });
  if (page === "kitchen")
    await refreshKitchen().catch(() => {
      /* cooking tables may be missing until migration 0014 */
    });
  if (page === "craft")
    await refreshCraft().catch(() => {
      /* crafting tables may be missing until migration 0027 */
    });
  if (page === "mining") {
    await refreshMining().catch(() => {
      /* mining tables may be missing until migration 0015 */
    });
    await refreshOnchainItems().catch(() => {
      /* on-chain items are optional (migration 0022 + operator config) */
    });
  }
  if (page === "racing")
    await refreshRacing().catch(() => {
      /* racing tables may be missing until migration 0016 */
    });
  controls();
}

/** Re-bind and refresh an in-pasture activity overlay if its panel is mounted. */
export async function refreshOpenActivityOverlay() {
  const jobs: Array<Promise<unknown>> = [];
  if (document.getElementById("fishing-summary")) jobs.push(refreshFishing());
  if (document.getElementById("mining-summary")) jobs.push(refreshMining());
  if (document.getElementById("treasure-summary")) jobs.push(refreshTreasure());
  if (document.getElementById("racing-summary")) jobs.push(refreshRacing());
  if (document.getElementById("garden-summary")) jobs.push(refreshGarden());
  if (document.getElementById("kitchen-summary")) jobs.push(refreshKitchen());
  if (!jobs.length) return;
  await Promise.all(jobs.map((job) => job.catch(() => undefined)));
}
