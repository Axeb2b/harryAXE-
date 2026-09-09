import { describe, it, expect } from "vitest";
import {
  diffKeys,
  tagLine,
  summarizeContact,
  summarizeGalleryItem,
} from "./fetchWatcher";

describe("diffKeys", () => {
  it("returns only unseen keys", () => {
    expect(diffKeys(new Set(["a"]), { a: 1, b: 2 })).toEqual(["b"]);
  });
  it("returns [] for null, arrays treated as objects is fine", () => {
    expect(diffKeys(new Set(), null)).toEqual([]);
    expect(diffKeys(new Set(), undefined)).toEqual([]);
    expect(diffKeys(new Set(["x"]), {})).toEqual([]);
  });
});

describe("tagLine", () => {
  it("builds fetch/model/device tags", () => {
    expect(tagLine("contacts", "Pixel 9a", "c130182b7ad47e40")).toBe(
      "#fetch-contacts #Pixel9a #dev-c130182b"
    );
  });
  it("falls back on empty model", () => {
    expect(tagLine("gallery", "", "abc")).toBe("#fetch-gallery #unknown #dev-abc");
  });
});

describe("summarizeContact", () => {
  it("prefers name + number with fallbacks", () => {
    expect(summarizeContact({ name: "Asha", number: "+911234" })).toBe("Asha (+911234)");
    expect(summarizeContact({ title: "Mom", mobile: "999" })).toBe("Mom (999)");
    expect(summarizeContact(null)).toBe("contact");
    expect(summarizeContact("str")).toBe("contact");
  });
});

describe("summarizeGalleryItem", () => {
  it("handles strings, objects, and keys", () => {
    expect(summarizeGalleryItem("k", "http://x/y.jpg")).toBe("http://x/y.jpg");
    expect(summarizeGalleryItem("k", { fileName: "a.png" })).toBe("a.png");
    expect(summarizeGalleryItem("mykey", 42)).toBe("mykey");
  });
});
