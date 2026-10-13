import { describe, it, expect } from "vitest";
import { mapCourierStatus } from "../steadfast.server";
describe("mapCourierStatus", () => {
  it("delivered → delivered", () => expect(mapCourierStatus("delivered")).toBe("delivered"));
  it("partial_delivered → delivered", () => expect(mapCourierStatus("partial_delivered_approval_pending")).toBe("delivered"));
  it("cancelled → cancelled", () => expect(mapCourierStatus("cancelled")).toBe("cancelled"));
  it("in_review stays shipped", () => expect(mapCourierStatus("in_review")).toBe("shipped"));
});
