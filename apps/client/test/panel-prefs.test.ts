import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PANEL_PREFS,
  isCollapsed,
  parsePanelPrefs,
  togglePanel,
  usePanelStore,
} from "../src/state/panelStore";

test("a first visit shows everything on a wide screen, nothing on a phone", () => {
  const prefs = DEFAULT_PANEL_PREFS;
  for (const panel of ["inspect", "news"] as const) {
    assert.equal(isCollapsed(prefs, panel, false), false, `${panel} wide`);
    assert.equal(isCollapsed(prefs, panel, true), true, `${panel} narrow`);
  }
});

test("wide panels fold independently", () => {
  const prefs = togglePanel(DEFAULT_PANEL_PREFS, "inspect", false);
  assert.equal(isCollapsed(prefs, "inspect", false), true);
  assert.equal(isCollapsed(prefs, "news", false), false);
  // The phone layout keeps its own choices.
  assert.deepEqual(prefs.narrow, DEFAULT_PANEL_PREFS.narrow);
  const back = togglePanel(prefs, "inspect", false);
  assert.deepEqual(back, DEFAULT_PANEL_PREFS);
});

test("the phone inspector opens and closes without touching the wide layout", () => {
  let prefs = togglePanel(DEFAULT_PANEL_PREFS, "inspect", true);
  assert.equal(isCollapsed(prefs, "inspect", true), false);
  prefs = togglePanel(prefs, "inspect", true);
  assert.equal(isCollapsed(prefs, "inspect", true), true);
  assert.deepEqual(prefs.wide, DEFAULT_PANEL_PREFS.wide);
});

test("prefs saved when there was an Influences panel still load", () => {
  const old = JSON.stringify({
    wide: { influence: true, inspect: true, news: false },
    narrow: { open: "influence", newsCollapsed: false },
  });
  assert.deepEqual(parsePanelPrefs(old), {
    wide: { inspect: true, news: false },
    narrow: { open: null, newsCollapsed: false },
  });
});

test("the phone news feed folds on its own", () => {
  let prefs = togglePanel(DEFAULT_PANEL_PREFS, "inspect", true);
  prefs = togglePanel(prefs, "news", true);
  assert.equal(isCollapsed(prefs, "news", true), false);
  assert.equal(isCollapsed(prefs, "inspect", true), false);
});

test("stored prefs round-trip and bad data falls back to defaults", () => {
  const prefs = togglePanel(
    togglePanel(DEFAULT_PANEL_PREFS, "news", false),
    "inspect",
    true,
  );
  assert.deepEqual(parsePanelPrefs(JSON.stringify(prefs)), prefs);

  assert.deepEqual(parsePanelPrefs(null), DEFAULT_PANEL_PREFS);
  assert.deepEqual(parsePanelPrefs("not json"), DEFAULT_PANEL_PREFS);
  assert.deepEqual(parsePanelPrefs("null"), DEFAULT_PANEL_PREFS);
  assert.deepEqual(parsePanelPrefs("[1]"), DEFAULT_PANEL_PREFS);
  // Wrong types and unknown panels are dropped field by field.
  assert.deepEqual(
    parsePanelPrefs(
      JSON.stringify({
        wide: { influence: true, inspect: "yes" },
        narrow: { open: "map", newsCollapsed: false },
      }),
    ),
    {
      wide: { inspect: false, news: false },
      narrow: { open: null, newsCollapsed: false },
    },
  );
});

test("the store toggles without browser storage", () => {
  usePanelStore.setState({ prefs: DEFAULT_PANEL_PREFS });
  usePanelStore.getState().toggle("inspect", true);
  assert.equal(usePanelStore.getState().prefs.narrow.open, "inspect");
  usePanelStore.getState().toggle("inspect", true);
  assert.equal(usePanelStore.getState().prefs.narrow.open, null);
});
