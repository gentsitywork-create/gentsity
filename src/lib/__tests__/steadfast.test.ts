import { describe, it, expect } from "vitest";
import { mapCourierStatus } from "../steadfast.server";
describe("mapCourierStatus", () => {
  it("delivered → delivered", () => expect(mapCourierStatus("delivered")).toBe("delivered"));
  it("partial_delivered → partial", () => expect(mapCourierStatus("partial_delivered_approval_pending")).toBe("partial_delivered"));
  it("courier pending → courier_pending", () => expect(mapCourierStatus("pending")).toBe("courier_pending"));
  it("cancelled → cancelled", () => expect(mapCourierStatus("cancelled")).toBe("cancelled"));
  it("in_review → in review (shipped)", () => expect(mapCourierStatus("in_review")).toBe("shipped"));
});
