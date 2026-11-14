/** Kitchen desk DOM helpers. The desk is not mounted during Bag Use. */

export type KitchenDeskHost = {
  querySelector(selectors: string): Element | null;
};

export type KitchenDesk = {
  summary: HTMLElement | null;
  recipes: HTMLElement | null;
  dishes: HTMLElement | null;
  mounted: boolean;
};

export function queryKitchenDesk(host?: KitchenDeskHost | null): KitchenDesk {
  if (!host) {
    return { summary: null, recipes: null, dishes: null, mounted: false };
  }
  const summary = host.querySelector("#kitchen-summary") as HTMLElement | null;
  const recipes = host.querySelector("#kitchen-recipes") as HTMLElement | null;
  const dishes = host.querySelector("#kitchen-dishes") as HTMLElement | null;
  return {
    summary,
    recipes,
    dishes,
    mounted: Boolean(summary || recipes || dishes),
  };
}

/** Assign text only when the desk node exists (Bag Use has no kitchen panel). */
export function setDeskText(
  el: { textContent: string | null } | null,
  text: string,
): void {
  if (!el) return;
  el.textContent = text;
}
