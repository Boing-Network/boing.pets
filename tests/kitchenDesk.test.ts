import { describe, expect, it } from "vitest";
import { queryKitchenDesk, setDeskText } from "../src/ui/kitchenDesk";

function hostWith(ids: string[]) {
  const nodes = Object.fromEntries(
    ids.map((id) => [id, { id, textContent: "", replaceChildren() {} }]),
  );
  return {
    querySelector(selector: string) {
      const id = selector.startsWith("#") ? selector.slice(1) : selector;
      return (nodes[id] ?? null) as Element | null;
    },
  };
}

describe("kitchen desk queries", () => {
  it("treats a missing kitchen panel as unmounted so Bag Use can skip DOM writes", () => {
    const desk = queryKitchenDesk(hostWith([]));
    expect(desk.mounted).toBe(false);
    expect(desk.summary).toBeNull();
    expect(desk.recipes).toBeNull();
    expect(desk.dishes).toBeNull();
    expect(() =>
      setDeskText(desk.summary, "Snack served — vitals boosted."),
    ).not.toThrow();
  });

  it("finds kitchen desk nodes when the kitchen panel is on the page", () => {
    const desk = queryKitchenDesk(
      hostWith(["kitchen-summary", "kitchen-recipes", "kitchen-dishes"]),
    );
    expect(desk.mounted).toBe(true);
    expect(desk.summary).toBeTruthy();
    expect(desk.recipes).toBeTruthy();
    expect(desk.dishes).toBeTruthy();
    setDeskText(desk.summary, "Cooked 1/5 · served 1/5");
    expect(desk.summary?.textContent).toBe("Cooked 1/5 · served 1/5");
  });

  it("does not throw when writing a kitchen summary that is not on the page", () => {
    const empty = hostWith([]);
    // The previous refreshKitchen path used $("#kitchen-summary").textContent,
    // which throws "Cannot set properties of null (setting 'textContent')"
    // when the snack is used from the Bag and the kitchen desk is unmounted.
    const $ = (selector: string) => empty.querySelector(selector)!;
    expect(() => {
      $("#kitchen-summary").textContent = "Cooked 0/5 · served 0/5";
    }).toThrow(/textContent/);
    const desk = queryKitchenDesk(empty);
    expect(desk.mounted).toBe(false);
    expect(() => {
      if (!desk.mounted) return;
      setDeskText(desk.summary, "Cooked 0/5 · served 0/5");
    }).not.toThrow();
  });
});
