import { SITE_LINKS, type SiteSection } from "../site/routes";

/** Home · Play · Marketplace, in the game header (never over the 3D view). */
export function SiteNav({ current }: { current: SiteSection }) {
  return (
    <nav className="site-nav" aria-label="Site">
      {SITE_LINKS.map((link) => (
        <a
          key={link.key}
          href={link.href}
          aria-current={link.key === current ? "page" : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
