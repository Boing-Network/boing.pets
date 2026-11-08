import { describe, expect, it } from "vitest";
import { apiUnavailableMessage } from "../src/ui/apiMessages";

describe("api client messaging", () => {
  it("explains static-host 404s without blaming JSON parse", () => {
    const msg = apiUnavailableMessage(404);
    expect(msg).toMatch(/static preview/i);
    expect(msg).toMatch(/dev:api/);
  });

  it("points other failures at the local Worker", () => {
    expect(apiUnavailableMessage(502)).toMatch(/dev:api/);
    expect(apiUnavailableMessage()).toMatch(/Worker/);
  });
});
