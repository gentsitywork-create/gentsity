import { describe, expect, it } from "vitest";
import { POLO_OFFER_ENABLED, poloOfferPrice, poloOfferValid } from "../polo-offer";

describe("polo 10-minute offer", () => {
  it("1050 becomes 999 during the offer", () => {
    expect(poloOfferPrice(1050, true)).toBe(999);
  });
  it("full price after the offer", () => {
    expect(poloOfferPrice(1050, false)).toBe(1050);
  });
  it("valid within 10 minutes, expired after", () => {
    const t = 1_000_000_000;
    expect(poloOfferValid(t, t + 9 * 60_000)).toBe(true);
    expect(poloOfferValid(t, t + 11 * 60_000)).toBe(false);
  });
  it("offer is currently switched off — timer never activates and full price applies", () => {
    expect(POLO_OFFER_ENABLED).toBe(false);
    const t = 1_000_000_000;
    expect(poloOfferValid(t, t + 60_000)).toBe(false);
    expect(poloOfferPrice(1050, poloOfferValid(t, t + 60_000))).toBe(1050);
  });
});
