export function tiktokPurchasePayload(opts: {
  pixelId: string; orderNo: number | string; total: number; phoneHash: string;
  timestamp: number; url?: string; ip?: string; userAgent?: string; ttclid?: string; ttp?: string;
}) {
  return {
    event_source: "web",
    event_source_id: opts.pixelId,
    data: [{
      event: "Purchase",
      event_id: `order-${opts.orderNo}`,
      event_time: opts.timestamp,
      page: { url: opts.url },
      user: { phone: opts.phoneHash, ip: opts.ip, user_agent: opts.userAgent, ttclid: opts.ttclid, ttp: opts.ttp },
      properties: { value: opts.total, currency: "BDT" },
    }],
  };
}

export function tiktokBrowserEvent(event: string): "Purchase" | "ViewContent" | undefined {
  if (event === "Purchase" || event === "ViewContent") return event;
  return undefined;
}