/** Shared client for the crafting table API (page + pasture overlay). */

import type { CraftRecipe } from "../content/crafting";
import { api, app } from "./appRuntime";
import { assertWallet } from "./careActions";

export type CraftStatus = {
  recipes: CraftRecipe[];
  inventory: Record<string, number>;
  craftedToday: number;
  dailyCap: number;
  rules: {
    version: string;
    dailyCap: number;
    kitchen: string;
  };
  now: number;
};

export async function loadCraftStatus(
  owner: string | null,
): Promise<CraftStatus> {
  return api<CraftStatus>(
    "/api/craft/status" + (owner ? `?owner=${owner}` : ""),
  );
}

export async function craftRecipe(recipeId: string): Promise<{ ok: boolean }> {
  await assertWallet();
  const challenge = await api<{ id: string; message: string }>(
    "/api/craft/challenge",
    { owner: app.owner, recipe_id: recipeId },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  return api<{ ok: boolean }>("/api/craft/confirm", {
    id: challenge.id,
    signature,
  });
}
