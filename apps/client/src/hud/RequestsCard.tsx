/**
 * Territory requests in the Inspector's home view: where the creatures are
 * struggling, what from the Workshop would help, and whether the bag has it.
 */
import { useMemo } from "react";
import { useWorkshopStore } from "../state/workshopStore";
import { useWorldViewStore } from "../state/worldViewStore";
import {
  REQUEST_RULES,
  requestSupply,
  territoryRequests,
  type TerritoryRequest,
} from "./requests";

/** Requests for the world on screen (empty until it has loaded). */
export function useTerritoryRequests(): TerritoryRequest[] {
  const territories = useWorldViewStore((s) => s.view?.territories);
  const creatures = useWorldViewStore((s) => s.view?.creatures);
  return useMemo(
    () => territoryRequests(territories ?? [], creatures ?? []),
    [territories, creatures],
  );
}

export function RequestsCard() {
  const requests = useTerritoryRequests();
  const bag = useWorkshopStore((s) => s.bag);
  const openFor = useWorkshopStore((s) => s.openFor);
  if (requests.length === 0) return null;
  const shown = requests.slice(0, REQUEST_RULES.shown);
  const more = requests.length - shown.length;
  return (
    <section className="requests" aria-labelledby="requests-title">
      <h3 id="requests-title" className="requests-title">
        Requests
        <span className="requests-count">{requests.length}</span>
      </h3>
      <ul className="requests-list">
        {shown.map((request) => {
          const supply = bag == null ? null : requestSupply(request, bag);
          return (
            <li key={request.territoryId} className="requests-row">
              <div className="requests-text">
                <strong>{request.title}</strong>
                <span>
                  {request.detail} {supply?.text ?? ""}
                </span>
              </div>
              <button
                type="button"
                className={`requests-go${supply?.state === "have" ? " is-ready" : ""}`}
                onClick={() => openFor(request.territoryId, request.creatureId)}
                aria-label={`Open the Workshop for ${request.territoryName}`}
              >
                {supply?.state === "have" ? "Answer" : "Workshop"}
              </button>
            </li>
          );
        })}
      </ul>
      {more > 0 ? (
        <p className="requests-more">
          and {more} more {more === 1 ? "territory" : "territories"} asking.
        </p>
      ) : null}
    </section>
  );
}
