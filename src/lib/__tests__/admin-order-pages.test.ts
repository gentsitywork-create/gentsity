import { describe, expect, it } from "vitest";
import { orderPage } from "../admin-order-pages";

describe("order pagination", () => {
  const orders = Array.from({ length: 2218 }, (_, id) => ({ id }));
  it("bounds rendered orders without losing older orders", () => {
    const first = orderPage(orders, 1);
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0]?.id).toBe(0);
    expect(first.pageCount).toBe(45);
    expect(orderPage(orders, 21).rows[0]?.id).toBe(1000);
    expect(orderPage(orders, 45).rows.at(-1)?.id).toBe(2217);
  });
  it("clamps the page after filtering or deleting orders", () => {
    const result = orderPage(orders.slice(0, 3), 45);
    expect(result.page).toBe(1);
    expect(result.rows).toHaveLength(3);
    expect(orderPage([], 0).rows).toEqual([]);
  });
});