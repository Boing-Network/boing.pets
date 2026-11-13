import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  COSMETIC_SLOT_LABELS,
  COSMETIC_SLOTS,
  slotForCosmetic,
  type CosmeticSlot,
  type EquippedCosmetics,
} from "../content/cosmetics";
import { itemRarity } from "../content/items";
import { CATALOG, catalogItem } from "../economy";
import { playSfx } from "../audio";
import { app, notice, api } from "../ui/appRuntime";
import { run } from "../ui/careActions";
import { sessionApi } from "../ui/socialSession";
import { currentPastureMount } from "./mountPasture3d";

type OwnedRow = { id: string; slot: CosmeticSlot | null; name: string };
type CatalogRow = {
  id: string;
  slot: CosmeticSlot | null;
  name: string;
  kind: string;
};
type FurnitureRow = {
  id: string;
  name: string;
  kind: string;
  owned: boolean;
};

type CosmeticsPayload = {
  equipped: EquippedCosmetics;
  owned: OwnedRow[];
  catalog: CatalogRow[];
  furniture?: FurnitureRow[];
};

function rarityLabel(itemId: string): string {
  const rarity = itemRarity(itemId);
  if (!rarity) return "";
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function applyLocalEquip(owner: string, equipped: EquippedCosmetics) {
  if (app.mine?.owner === owner) app.mine.cosmetics = equipped;
  currentPastureMount()?.setEquipped(owner, equipped);
  window.__pasture3d?.sendCosmetics(equipped);
}

export function PastureCustomizeMenu({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<CosmeticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!app.owner) {
      setData(null);
      return;
    }
    const next = await api<CosmeticsPayload>(
      "/api/pet/cosmetics?owner=" + encodeURIComponent(app.owner),
    );
    setData({
      equipped: next.equipped || {},
      owned: next.owned || [],
      catalog: next.catalog || [],
      furniture: next.furniture,
    });
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load cosmetics");
    });
    closeRef.current?.focus();
  }, [reload]);

  const equip = (slot: CosmeticSlot, itemId: string | null, label: string) => {
    if (!app.owner) return;
    setError(null);
    setFlash(null);
    setBusyId(itemId || `unequip-${slot}`);
    void run(async () => {
      notice("Approve the equip signature in Express...");
      const result = await sessionApi<{
        ok: boolean;
        equipped: EquippedCosmetics;
      }>("/api/pet/cosmetics/equip", {
        owner: app.owner,
        slot,
        item_id: itemId,
      });
      const equipped = result.equipped || {};
      applyLocalEquip(app.owner, equipped);
      setData((prev) => (prev ? { ...prev, equipped } : prev));
      const msg = itemId ? `Equipped ${label}.` : `Unequipped ${label}.`;
      setFlash(msg);
      notice(msg);
      playSfx("equip");
    })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not equip";
        setError(msg);
        notice(msg, true);
      })
      .finally(() => setBusyId(null));
  };

  const catalog = data?.catalog?.length
    ? data.catalog
    : CATALOG.map((item) => ({
        id: item.id,
        slot: slotForCosmetic(item.id),
        name: item.name,
        kind: item.kind,
      })).filter((item) => item.slot);

  const ownedIds = new Set((data?.owned || []).map((row) => row.id));
  const furniture =
    data?.furniture ||
    CATALOG.filter((item) => item.kind === "furniture").map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      owned: false,
    }));
  const furnitureKnown = Array.isArray(data?.furniture);

  return (
    <div
      className="pasture-station-menu customize-station-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="pasture-station-menu-head">
        <div>
          <p className="eyebrow">PASTURE STATION</p>
          <h2 id={titleId}>Customization Station</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="quiet pasture-station-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <p className="subtle">
        Try on hats, frames, and tools you already own. Furniture is placed on
        your <a href="/home.html">Home plot</a>, not worn in the pasture.
      </p>
      {!app.owner ? (
        <p className="small">Connect Boing Express to manage your look.</p>
      ) : !app.mine ? (
        <p className="small">Hatch your buddy first to equip cosmetics.</p>
      ) : !data ? (
        <p className="small">Loading your wardrobe...</p>
      ) : null}
      {flash ? (
        <p className="pasture-station-flash" role="status">
          {flash}
        </p>
      ) : null}
      {error ? (
        <p className="pasture-station-error" role="alert">
          {error}
        </p>
      ) : null}
      {COSMETIC_SLOTS.map((slot) => {
        const items = catalog.filter((item) => item.slot === slot);
        const equippedId = data?.equipped?.[slot];
        return (
          <section key={slot} className="customize-slot">
            <h3>{COSMETIC_SLOT_LABELS[slot]}</h3>
            <div className="pasture-station-list">
              {items.map((item) => {
                const owned = ownedIds.has(item.id);
                const equipped = equippedId === item.id;
                const name = item.name || catalogItem(item.id)?.name || item.id;
                const rarity = rarityLabel(item.id);
                const rarityClass = itemRarity(item.id);
                return (
                  <article
                    key={item.id}
                    className={
                      "market-card customize-card" +
                      (owned ? "" : " is-locked") +
                      (equipped ? " is-equipped" : "")
                    }
                  >
                    <div className="customize-card-head">
                      <h3>{name}</h3>
                      {rarity && rarityClass ? (
                        <span className={"rarity-badge rarity-" + rarityClass}>
                          {rarity}
                        </span>
                      ) : null}
                    </div>
                    <p className="small">
                      {equipped
                        ? "Currently equipped"
                        : owned
                          ? "Owned"
                          : "Locked — not in your inventory yet"}
                    </p>
                    {owned && app.owner && app.mine ? (
                      <button
                        type="button"
                        className={equipped ? "secondary" : undefined}
                        disabled={!!busyId}
                        onClick={() =>
                          equip(slot, equipped ? null : item.id, name)
                        }
                      >
                        {busyId === item.id ||
                        (equipped && busyId === `unequip-${slot}`)
                          ? "Updating..."
                          : equipped
                            ? "Unequip"
                            : "Equip / sign"}
                      </button>
                    ) : (
                      <p className="small customize-locked-hint">Unearned</p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <section className="customize-slot">
        <h3>Furniture</h3>
        <p className="small">
          These pieces are placed on your Home plot, not worn as cosmetics.
        </p>
        <div className="pasture-station-list">
          {furniture.map((item) => {
            const rarity = rarityLabel(item.id);
            const rarityClass = itemRarity(item.id);
            const owned = furnitureKnown ? item.owned : false;
            return (
              <article
                key={item.id}
                className={
                  "market-card customize-card" + (owned ? "" : " is-locked")
                }
              >
                <div className="customize-card-head">
                  <h3>{item.name}</h3>
                  {rarity && rarityClass ? (
                    <span className={"rarity-badge rarity-" + rarityClass}>
                      {rarity}
                    </span>
                  ) : null}
                </div>
                <p className="small">
                  {furnitureKnown
                    ? owned
                      ? "Owned — place it on your Home plot"
                      : "Locked — not in your inventory yet"
                    : "Place furniture on your Home plot"}
                </p>
                <a className="button secondary" href="/home.html">
                  Open Home plot
                </a>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
