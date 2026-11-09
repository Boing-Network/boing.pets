import { configureTextBuilder } from "troika-three-text";
import { WORLD_FONT_URL, WORLD_UNICODE_FONTS_URL } from "./worldFont";

let configured = false;

/** Must run before the first troika font request. */
export function ensureWorldFontConfig() {
  if (configured) return;
  configured = true;
  configureTextBuilder({
    defaultFontURL: WORLD_FONT_URL,
    unicodeFontsURL: WORLD_UNICODE_FONTS_URL,
  });
}
