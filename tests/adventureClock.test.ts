import { describe, expect, it } from "vitest";
import {
  ADVENTURE_DEV_CLOCK_FLAG,
  ADVENTURE_DEV_CLOCK_HEADER,
  adventureDevClockEnabled,
  resolveAdventureNow,
} from "../src/content/adventureClock";

const wall = 1_700_000_000_000;
const future = wall + 3 * 60 * 60 * 1000;

function request(url: string, now?: string) {
  return {
    url,
    headers: {
      get(name: string) {
        if (now && name.toLowerCase() === ADVENTURE_DEV_CLOCK_HEADER)
          return now;
        return null;
      },
    },
  };
}

describe("adventure dev clock", () => {
  it("ignores a client time when the local flag is off", () => {
    const resolved = resolveAdventureNow(
      request("http://127.0.0.1:8787/api/adventures", String(future)),
      { APP_ORIGIN: "http://localhost:5173" },
      wall,
    );
    expect(resolved.devClock).toBe(false);
    expect(resolved.now).toBe(wall);
  });

  it("honors the header on localhost when the local flag is on", () => {
    const resolved = resolveAdventureNow(
      request("http://127.0.0.1:8787/api/adventures", String(future)),
      {
        ADVENTURE_DEV_CLOCK: ADVENTURE_DEV_CLOCK_FLAG,
        APP_ORIGIN: "http://localhost:5173",
      },
      wall,
    );
    expect(resolved.devClock).toBe(true);
    expect(resolved.now).toBe(future);
  });

  it("honors a now query on localhost when the local flag is on", () => {
    const resolved = resolveAdventureNow(
      request(`http://localhost:8787/api/adventures?now=${future}`),
      { ADVENTURE_DEV_CLOCK: ADVENTURE_DEV_CLOCK_FLAG },
      wall,
    );
    expect(resolved.now).toBe(future);
  });

  it("is impossible in production even if the flag is accidentally set", () => {
    const url = "https://boing-pets.nico-chikuji.workers.dev/api/adventures";
    expect(
      adventureDevClockEnabled(
        { ADVENTURE_DEV_CLOCK: ADVENTURE_DEV_CLOCK_FLAG, APP_ORIGIN: url },
        url,
      ),
    ).toBe(false);
    const resolved = resolveAdventureNow(
      request(url, String(future)),
      { ADVENTURE_DEV_CLOCK: ADVENTURE_DEV_CLOCK_FLAG, APP_ORIGIN: url },
      wall,
    );
    expect(resolved.devClock).toBe(false);
    expect(resolved.now).toBe(wall);
  });
});
