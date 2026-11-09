import { Text, type TextProps } from "@react-three/drei";
import { useLayoutEffect, type ReactNode } from "react";
import { ensureWorldFontConfig } from "../lib/configureWorldFonts";
import {
  WORLD_FONT_URL,
  WORLD_UNICODE_FONTS_URL,
  worldSafeText,
} from "../lib/worldFont";

type Props = Omit<TextProps, "font" | "children"> & {
  children: ReactNode;
};

/**
 * In-world label using the self-hosted Inter font. Keeps connect-src CSP tight
 * by never loading Google Fonts / jsDelivr unicode fallbacks.
 */
export function WorldText({ children, ...props }: Props) {
  useLayoutEffect(() => {
    ensureWorldFontConfig();
  }, []);

  const text =
    typeof children === "string" || typeof children === "number"
      ? worldSafeText(String(children))
      : children;

  return (
    <Text
      font={WORLD_FONT_URL}
      // troika reads this on the mesh even though drei's types omit it
      {...{ unicodeFontsURL: WORLD_UNICODE_FONTS_URL }}
      characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-+'#:_/()[]"
      {...props}
    >
      {text}
    </Text>
  );
}
