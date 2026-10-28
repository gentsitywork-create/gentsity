import { describe, expect, it } from "vitest";
import { tiktokBrowserEvent, tiktokPurchasePayload } from "../tiktok-events";

describe("TikTok order tracking", () => {
  const payload = tiktokPurchasePayload({ pixelId: "TEST_PIXEL", orderNo: 2859, total: 999, phoneHash: "test-hash", timestamp: 1793178000 });
  it("uses the same Purchase event and order ID in browser and server for deduplication", () => {
    expect(tiktokBrowserEvent("Purchase")).toBe("Purchase");
    expect(payload.data[0]?.event).toBe("Purchase");
    expect(payload.data[0]?.event_id).toBe("order-2859");
  });
  it("reports the actual order total in Bangladesh currency", () => {
    expect(payload.data[0]?.properties).toEqual({ value: 999, currency: "BDT" });
  });
  it("does not put an access token in the event body", () => {
    expect(payload).not.toHaveProperty("access_token");
    expect(payload.data[0]?.user.phone).toBe("test-hash");
  });
  it("forwards only supported storefront events", () => {
    expect(tiktokBrowserEvent("ViewContent")).toBe("ViewContent");
    expect(tiktokBrowserEvent("Unknown")).toBeUndefined();
  });
});