import {
  canCraftRecipe,
  craftItemName,
  missingIngredients,
  type CraftRecipe,
} from "../../content/crafting";
import { app, $, notice } from "../appRuntime";
import { run } from "../careActions";
import { craftRecipe, loadCraftStatus } from "../craftClient";

export async function craftAct(recipeId: string) {
  notice("Approve the crafting signature in Express...");
  const result = await craftRecipe(recipeId);
  await refreshCraft();
  notice("Crafted successfully.");
  return result;
}

export async function refreshCraft() {
  const root = document.querySelector("#craft-recipes");
  const summary = document.querySelector("#craft-summary");
  if (!root || !summary) return;
  const data = await loadCraftStatus(app.owner || null);
  summary.textContent = app.owner
    ? `${data.craftedToday} / ${data.dailyCap} crafts today (UTC). Combine activity resources at this table, or visit the Crafting Station in the public pasture.`
    : "Connect, hatch a buddy, then combine activity resources. The intended table is the Crafting Station in the public pasture; this page is a fallback.";
  const cells = data.recipes.map((recipe: CraftRecipe) => {
    const inv = data.inventory || {};
    const can = canCraftRecipe(recipe, inv);
    const missing = missingIngredients(recipe, inv);
    const capped = data.craftedToday >= data.dailyCap;
    const el = document.createElement("article");
    el.className = "market-card";
    const lines = recipe.inputs
      .map((ing) => {
        const have = inv[ing.itemId] || 0;
        return `<li>${craftItemName(ing.itemId)} ${have}/${ing.qty}</li>`;
      })
      .join("");
    el.innerHTML = `<h3>${recipe.name}</h3><p class="subtle">${recipe.description}</p><ul class="pasture-station-ings">${lines}</ul><p class="small">Makes ${recipe.outputQty}x ${craftItemName(recipe.outputItemId)}</p>${
      missing.length && !can
        ? '<p class="small">Need more ingredients to craft this.</p>'
        : ""
    }`;
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.textContent = "Craft / sign";
    btn.disabled = app.busy || !app.owner || !can || capped;
    btn.onclick = () =>
      void run(async () => {
        await craftAct(recipe.id);
      });
    el.append(btn);
    return el;
  });
  root.replaceChildren(...cells);
  const noticeEl = $("#notice");
  if (noticeEl && !app.owner) {
    /* keep existing notice */
  }
}
