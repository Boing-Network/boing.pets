/** Unique ink-and-paper posters for each Dispatch destination. */

export type AdventurePosterPalette = {
  accent: string;
  ink: string;
  paper: string;
  haze: string;
  glow: string;
};

export const ADVENTURE_POSTER_PALETTES: Record<string, AdventurePosterPalette> =
  {
    "night-market": {
      accent: "#ff2bd6",
      ink: "#14010e",
      paper: "#f7d6ee",
      haze: "#3b082c",
      glow: "#ff7ae0",
    },
    "rooftop-sessions": {
      accent: "#2ee0d0",
      ink: "#06151a",
      paper: "#d8f7f3",
      haze: "#0a3340",
      glow: "#ff4d00",
    },
    "underground-show": {
      accent: "#ff3b4e",
      ink: "#140306",
      paper: "#ffd6db",
      haze: "#3a0a12",
      glow: "#ffb000",
    },
    "designer-district": {
      accent: "#e8c36a",
      ink: "#16120a",
      paper: "#f4ead0",
      haze: "#3a3018",
      glow: "#fff4c8",
    },
    "the-lost-drop": {
      accent: "#9dff4a",
      ink: "#0b1208",
      paper: "#e4f5c8",
      haze: "#1c2c10",
      glow: "#c8ff8a",
    },
    "worldwide-pop-up": {
      accent: "#ff4d00",
      ink: "#140800",
      paper: "#ffe4d4",
      haze: "#3a1608",
      glow: "#2ec8e0",
    },
  };

const TITLES: Record<string, { kicker: string; title: string; mark: string }> =
  {
    "night-market": {
      kicker: "AFTER MIDNIGHT",
      title: "NIGHT\nMARKET",
      mark: "NM",
    },
    "rooftop-sessions": {
      kicker: "UNTIL DAWN",
      title: "ROOFTOP\nSESSIONS",
      mark: "RS",
    },
    "underground-show": {
      kicker: "NO SIGNAGE",
      title: "UNDERGROUND\nSHOW",
      mark: "UG",
    },
    "designer-district": {
      kicker: "APPOINTMENT ONLY",
      title: "DESIGNER\nDISTRICT",
      mark: "DD",
    },
    "the-lost-drop": {
      kicker: "RUMOR MAP",
      title: "THE LOST\nDROP",
      mark: "LD",
    },
    "worldwide-pop-up": {
      kicker: "LIMITED WINDOW",
      title: "WORLDWIDE\nPOP-UP",
      mark: "WP",
    },
  };

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}

function titleLines(locationId: string): string[] {
  return (TITLES[locationId]?.title ?? locationId.toUpperCase()).split("\n");
}

function artFor(locationId: string, p: AdventurePosterPalette): string {
  if (locationId === "night-market") {
    return `
      <rect x="18" y="78" width="84" height="10" fill="${p.haze}"/>
      <rect x="24" y="52" width="28" height="36" fill="${p.ink}" stroke="${p.accent}" stroke-width="2"/>
      <rect x="56" y="58" width="32" height="30" fill="${p.ink}" stroke="${p.paper}" stroke-width="2"/>
      <circle cx="38" cy="46" r="7" fill="${p.accent}"/>
      <circle cx="72" cy="50" r="6" fill="${p.glow}"/>
      <path d="M20 88 L40 70 L60 88" fill="none" stroke="${p.paper}" stroke-width="2"/>
      <rect x="86" y="40" width="14" height="48" fill="${p.haze}" stroke="${p.accent}" stroke-width="1.5"/>
    `;
  }
  if (locationId === "rooftop-sessions") {
    return `
      <rect x="18" y="86" width="100" height="8" fill="${p.haze}"/>
      <path d="M18 86 L30 58 L42 86 L56 48 L70 86 L86 54 L114 86" fill="none" stroke="${p.paper}" stroke-width="3"/>
      <circle cx="96" cy="36" r="10" fill="none" stroke="${p.accent}" stroke-width="3"/>
      <rect x="40" y="68" width="18" height="18" fill="${p.glow}"/>
      <rect x="72" y="72" width="12" height="14" fill="${p.accent}"/>
    `;
  }
  if (locationId === "underground-show") {
    return `
      <rect x="24" y="70" width="88" height="22" fill="${p.haze}"/>
      <rect x="36" y="48" width="64" height="10" fill="${p.accent}"/>
      <circle cx="40" cy="40" r="8" fill="${p.glow}"/>
      <circle cx="96" cy="40" r="8" fill="${p.glow}"/>
      <rect x="20" y="78" width="16" height="22" fill="${p.ink}" stroke="${p.paper}" stroke-width="2"/>
      <rect x="100" y="78" width="16" height="22" fill="${p.ink}" stroke="${p.paper}" stroke-width="2"/>
      <path d="M48 92 Q70 70 92 92" fill="none" stroke="${p.paper}" stroke-width="3"/>
    `;
  }
  if (locationId === "designer-district") {
    return `
      <rect x="28" y="36" width="80" height="60" fill="none" stroke="${p.accent}" stroke-width="3"/>
      <rect x="40" y="48" width="56" height="36" fill="${p.haze}"/>
      <path d="M40 84 L68 52 L96 84" fill="none" stroke="${p.paper}" stroke-width="3"/>
      <rect x="60" y="66" width="16" height="18" fill="${p.ink}" stroke="${p.accent}" stroke-width="2"/>
      <circle cx="112" cy="40" r="8" fill="none" stroke="${p.glow}" stroke-width="2"/>
    `;
  }
  if (locationId === "the-lost-drop") {
    return `
      <circle cx="70" cy="64" r="28" fill="none" stroke="${p.accent}" stroke-width="2" stroke-dasharray="4 5"/>
      <path d="M48 80 L62 52 L80 72 L96 44" fill="none" stroke="${p.paper}" stroke-width="3"/>
      <rect x="86" y="36" width="22" height="16" fill="${p.haze}" stroke="${p.glow}" stroke-width="2" transform="rotate(-12 97 44)"/>
      <circle cx="62" cy="52" r="3" fill="${p.accent}"/>
      <circle cx="96" cy="44" r="3" fill="${p.glow}"/>
    `;
  }
  return `
    <rect x="22" y="40" width="92" height="56" fill="${p.haze}" stroke="${p.accent}" stroke-width="3" rx="4"/>
    <rect x="30" y="50" width="76" height="10" fill="${p.glow}"/>
    <rect x="30" y="66" width="44" height="8" fill="${p.paper}"/>
    <rect x="30" y="78" width="28" height="8" fill="${p.accent}"/>
    <circle cx="104" cy="82" r="8" fill="${p.ink}" stroke="${p.paper}" stroke-width="2"/>
  `;
}

export function adventurePosterPalette(
  locationId: string,
): AdventurePosterPalette {
  return (
    ADVENTURE_POSTER_PALETTES[locationId] ??
    ADVENTURE_POSTER_PALETTES["night-market"]!
  );
}

export function adventurePosterSvg(locationId: string): string {
  const p = adventurePosterPalette(locationId);
  const meta = TITLES[locationId] ?? {
    kicker: "DISPATCH",
    title: locationId.toUpperCase(),
    mark: "ADV",
  };
  const lines = titleLines(locationId);
  const title = lines
    .map(
      (line, i) =>
        `<text x="18" y="${118 + i * 18}" fill="${p.paper}" font-size="16" font-weight="800" font-family="Arial Black, Impact, sans-serif">${esc(line)}</text>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180" role="img" aria-label="${esc(meta.title.replace("\n", " "))} poster">
  <rect width="160" height="180" fill="${p.ink}"/>
  <rect x="6" y="6" width="148" height="168" fill="none" stroke="${p.paper}" stroke-width="3"/>
  <rect x="10" y="10" width="140" height="160" fill="${p.haze}" opacity="0.55"/>
  <rect x="10" y="10" width="46" height="14" fill="${p.accent}"/>
  <text x="14" y="20" fill="${p.ink}" font-size="7" font-weight="800" font-family="Arial, sans-serif">${esc(meta.mark)}</text>
  <text x="60" y="20" fill="${p.paper}" font-size="7" font-weight="700" font-family="Arial, sans-serif" letter-spacing="1">${esc(meta.kicker)}</text>
  ${artFor(locationId, p)}
  ${title}
  <rect x="114" y="150" width="32" height="18" fill="${p.accent}" transform="rotate(-8 130 159)"/>
  <text x="118" y="162" fill="${p.ink}" font-size="7" font-weight="800" font-family="Arial, sans-serif" transform="rotate(-8 130 159)">GO</text>
  <circle cx="24" cy="160" r="6" fill="none" stroke="${p.glow}" stroke-width="2"/>
</svg>`;
}

export function adventurePosterDataUrl(locationId: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(adventurePosterSvg(locationId))}`;
}
