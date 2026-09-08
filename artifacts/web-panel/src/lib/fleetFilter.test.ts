import { describe, it, expect } from "vitest";
import { filterFleet, hasCards } from "./fleetFilter";

const now = Date.now();

function dev(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    model: "POCO X3",
    phone: "91" + id.slice(0, 9),
    upi: "",
    battery: "80%",
    sim1: "",
    sim2: "",
    isOnline: false,
    joinedTs: 0,
    raw: {},
    ...extra,
  };
}

describe("filterFleet", () => {
  const list = [
    dev("d1", { isOnline: true, joinedTs: now - 1000 }),
    dev("d2", { isOnline: false, joinedTs: now - 2000 }),
    dev("d3", {
      isOnline: true,
      upi: "a@okhdfc",
      group: "g1",
      joinedTs: now - 3000,
    }),
    dev("d4", { isOnline: false, group: "g1", joinedTs: now - 4000 }),
  ];

  it("filters online", () => {
    const out = filterFleet({ devices: list, filter: "online" });
    expect(out.map((d) => d.id)).toEqual(["d1", "d3"]);
  });

  it("filters offline", () => {
    const out = filterFleet({ devices: list, filter: "offline" });
    expect(out.map((d) => d.id)).toEqual(["d2", "d4"]);
  });

  it("filters by upi", () => {
    const out = filterFleet({ devices: list, filter: "upi" });
    expect(out.map((d) => d.id)).toEqual(["d3"]);
  });

  it("sorts newest first by default", () => {
    const out = filterFleet({ devices: list });
    expect(out[0].id).toBe("d1");
    expect(out[out.length - 1].id).toBe("d4");
  });

  it("sorts oldest first", () => {
    const out = filterFleet({ devices: list, sortMode: "oldest" });
    expect(out[0].id).toBe("d4");
  });

  it("filters by group", () => {
    const out = filterFleet({ devices: list, group: "g1" });
    expect(out.map((d) => d.id)).toEqual(["d3", "d4"]);
  });

  it("searches by model", () => {
    const out = filterFleet({ devices: list, search: "poco" });
    expect(out.length).toBe(4);
  });

  it("searches by device id", () => {
    const out = filterFleet({ devices: list, search: "d2" });
    expect(out.map((d) => d.id)).toEqual(["d2"]);
  });

  it("pinned float to top", () => {
    const out = filterFleet({ devices: list, pinnedIds: new Set(["d4"]) });
    expect(out[0].id).toBe("d4");
  });

  it("hasCards detects cc_ keys", () => {
    expect(hasCards(dev("x", { raw: { cc_cardNumber: "4111" } }))).toBe(true);
    expect(hasCards(dev("y"))).toBe(false);
  });
});
