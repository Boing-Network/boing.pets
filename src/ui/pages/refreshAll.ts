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

export async function refresh(page: PageId) {
  if (page === "pasture") {
    await refreshBuddyCard();
    await refreshPastureGallery();
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
  if (page === "mining")
    await refreshMining().catch(() => {
      /* mining tables may be missing until migration 0015 */
    });
  if (page === "racing")
    await refreshRacing().catch(() => {
      /* racing tables may be missing until migration 0016 */
    });
  controls();
}
