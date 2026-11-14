/** Self-hosted Inter for troika / drei <Text> (OFL). See public/fonts/OFL.txt. */

/** Latin Inter Regular served from our own origin (public/fonts). */
export const WORLD_FONT_URL = "/fonts/Inter-Regular.woff";

/**
 * Same-origin stub so troika does not default unicodeFontsURL to jsDelivr.
 * World labels are Latin-only via worldSafeText; no fallback font files shipped.
 */
export const WORLD_UNICODE_FONTS_URL = "/fonts/unicode-font-resolver";

/** Strip to Latin printable so troika never requests unicode CDN fonts. */
export function worldSafeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Self-hosted Bebas Neue (OFL) for stencil / street-sign world labels. */
export const YARD_LABEL_FONT_URL = "/fonts/BebasNeue-Regular.ttf";
