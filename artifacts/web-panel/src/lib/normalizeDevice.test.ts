import { describe, it, expect } from "vitest";
import { normalizeDevice } from "./normalizeDevice";

describe("normalizeDevice", () => {
  it("normalizes full payload", () => {
    const raw = {
      modelName: "Pixel 8",
      mobNo: "1234567890",
      upi: "user@upi",
      battery: "85%",
      sims: [
        { phoneNumber: "123", carrierName: "Airtel" },
        { phoneNumber: "456", carrierName: "Jio" },
      ],
      status: true,
      ip_address: "1.2.3.4",
    };
    const dev = normalizeDevice("id1", raw);
    expect(dev.id).toBe("id1");
    expect(dev.model).toBe("Pixel 8");
    expect(dev.phone).toBe("1234567890");
    expect(dev.sim1).toBe("123 · Airtel");
    expect(dev.sim2).toBe("456 · Jio");
    expect(dev.isOnline).toBe(true);
    expect(dev.ip_address).toBe("1.2.3.4");
  });

  it("handles missing optional fields", () => {
    const raw = { model: "Old", phone: "999" };
    const dev = normalizeDevice("id2", raw);
    expect(dev.model).toBe("Old");
    expect(dev.upi).toBe("");
    expect(dev.isOnline).toBe(false);
  });

  it("parses ping timestamp for online check", () => {
    const now = Date.now();
    const raw = { ping: String(now - 100000) };
    const dev = normalizeDevice("id3", raw);
    expect(dev.isOnline).toBe(true);
  });
});

it("treats lastPing (SDK heartbeat) within 5 min as online", () => {
  const now = Date.now();
  const dev = normalizeDevice("hb", { lastPing: now - 120000 });
  expect(dev.isOnline).toBe(true);
});

it("treats stale lastPing (>5 min) as offline", () => {
  const now = Date.now();
  const dev = normalizeDevice("stale", { lastPing: now - 400000 });
  expect(dev.isOnline).toBe(false);
});
