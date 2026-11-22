import { useState, type CSSProperties } from "react";
import { speciesImageSrc, type SpeciesSlug } from "@boing-pets/contract";
import { skinForSkinId } from "../view/species-skins";

type Props = {
  slug: SpeciesSlug;
  name: string;
  className?: string;
};

/**
 * `/media/species/<slug>.webp` with the same muted, glow-tinted placeholder
 * the marketing gallery uses when a portrait is missing.
 */
export function SpeciesPortrait({ slug, name, className }: Props) {
  const [failed, setFailed] = useState(false);
  const skin = skinForSkinId(slug);
  if (failed) {
    return (
      <div
        className={`species-portrait placeholder${className ? ` ${className}` : ""}`}
        role="img"
        aria-label={`${name} (render coming soon)`}
        style={
          {
            "--glow": skin.emissive,
            "--coat": skin.primary,
          } as CSSProperties
        }
      >
        <span>{name}</span>
      </div>
    );
  }
  return (
    <img
      className={`species-portrait${className ? ` ${className}` : ""}`}
      src={speciesImageSrc(slug) ?? undefined}
      alt={`${name}, rendered in the world's moonlight`}
      width={480}
      height={327}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
