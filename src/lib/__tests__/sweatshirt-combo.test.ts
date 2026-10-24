import { describe, expect, it } from "vitest";
import { SWEATSHIRT_COMBO_PRICE, SWEATSHIRT_COMBO_DELIVERY, SWEATSHIRT_COMBO_SIZES, sweatshirtComboSchema } from "../sweatshirt-combo";
import { formatBilingualDate } from "../bilingual-date";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const order = { phone: "01700000000", size: "M", sweatshirt_ids: ids };
describe("sweatshirt combo rules", () => {
  it("costs 999 taka", () => expect(SWEATSHIRT_COMBO_PRICE).toBe(999));
  it("has free delivery", () => expect(SWEATSHIRT_COMBO_DELIVERY).toBe(0));
  it("requires exactly three sweatshirts", () => {
    expect(sweatshirtComboSchema.safeParse(order).success).toBe(true);
    expect(sweatshirtComboSchema.safeParse({ ...order, sweatshirt_ids: ids.slice(0, 2) }).success).toBe(false);
    expect(sweatshirtComboSchema.safeParse({ ...order, sweatshirt_ids: [...ids, ids[0]] }).success).toBe(false);
  });
  it("requires distinct designs as in hoodie combo", () => expect(sweatshirtComboSchema.safeParse({ ...order, sweatshirt_ids: [ids[0], ids[0], ids[1]] }).success).toBe(false));
  it("only allows M-38 L-40 XL-42", () => {
    expect(SWEATSHIRT_COMBO_SIZES).toEqual([{ key: "M", label: "M-38" }, { key: "L", label: "L-40" }, { key: "XL", label: "XL-42" }]);
    for (const size of ["M", "L", "XL"]) expect(sweatshirtComboSchema.safeParse({ ...order, size }).success).toBe(true);
    expect(sweatshirtComboSchema.safeParse({ ...order, size: "XXL" }).success).toBe(false);
  });
  it("uses Bangladesh time in both languages", () => {
    const result = formatBilingualDate(new Date("2026-10-14T13:42:00Z"));
    expect(result.en).toContain("07:42 pm");
    expect(result.bn).toContain("০৭:৪২");
    expect(result.bn).toContain("২০২৬");
  });
});