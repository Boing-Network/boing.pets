/**
 * Bestiary: a browsable catalog of every species (`?bestiary`), or a close-up
 * of one (`?bestiary=<slug>`) with the live 3D model and catalog stats.
 *
 * Capture mode (`?bestiary=<slug>&capture=1`, or bare `?bestiary&capture=1`)
 * keeps the original portrait tool: no overlay, DPR locked to 1, fullscreen
 * stage. It is used to take the `/media/species/` stills.
 */
import { useCallback, useEffect, useState } from "react";
import { BestiaryDetail } from "./BestiaryDetail";
import { BestiaryIndex } from "./BestiaryIndex";
import { BestiaryStage } from "./BestiaryStage";
import {
  BESTIARY_INDEX_HREF,
  bestiaryHref,
  parseBestiarySearch,
  speciesCatalogRowBySlug,
} from "./bestiary-data";
import { useSpeciesLiveCounts } from "./bestiary-live-hook";
import "./bestiary.css";

function useBestiarySearch(): [
  string,
  (href: string, replace?: boolean) => void,
] {
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((href: string, replace = false) => {
    const next = new URL(href, window.location.href);
    const path = `${next.pathname}${next.search}${next.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (path === current) {
      setSearch(next.search);
      return;
    }
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setSearch(next.search);
  }, []);
  return [search, go];
}

export function Bestiary() {
  const [search, go] = useBestiarySearch();
  const { slug, capture, pose } = parseBestiarySearch(search);
  const live = useSpeciesLiveCounts();
  const row = slug ? speciesCatalogRowBySlug(slug) : null;

  useEffect(() => {
    if (capture) return;
    const previous = document.title;
    document.title = row
      ? `${row.displayName} · Bestiary · Living Pets`
      : "Bestiary · Living Pets";
    return () => {
      document.title = previous;
    };
  }, [capture, row]);

  // Portrait capture tool: no nav, no stats, locked DPR, fullscreen canvas.
  if (capture) {
    return <BestiaryStage slug={slug} pose={pose} capture />;
  }

  if (row) {
    return (
      <BestiaryDetail
        row={row}
        pose={pose}
        live={live?.get(row.slug) ?? undefined}
        onBack={() => go(BESTIARY_INDEX_HREF)}
      />
    );
  }

  return (
    <BestiaryIndex
      unknownSlug={slug || undefined}
      live={live}
      onOpen={(next) => go(bestiaryHref(next))}
    />
  );
}
