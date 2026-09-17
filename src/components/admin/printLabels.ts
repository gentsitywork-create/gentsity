import QRCode from "qrcode";

export type LabelOrder = {
  order_no: number;
  customer_name: string;
  phone: string;
  address: string;
  district: string | null;
  total_amount: number;
  courier_consignment_id: string | null;
  courier_tracking_code: string | null;
  order_items: { size: string; color_name: string; qty: number }[];
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function printCourierLabels(orders: LabelOrder[], brand = "Gentsity") {
  if (orders.length === 0) return;

  const labels = await Promise.all(
    orders.map(async (o) => {
      const code = o.courier_tracking_code || o.courier_consignment_id || `GT-${o.order_no}`;
      const qrValue = o.courier_tracking_code
        ? `https://steadfast.com.bd/t/${o.courier_tracking_code}`
        : code;
      const qr = await QRCode.toDataURL(qrValue, { margin: 1, width: 220 });
      const items = o.order_items
        .map((i) => `${esc(i.color_name)} (${esc(i.size)}) ×${i.qty}`)
        .join(", ");
      return `
        <div class="label">
          <div class="top">
            <div>
              <div class="brand">${esc(brand)}</div>
              <div class="courier">Steadfast Courier</div>
            </div>
            <img class="qr" src="${qr}" alt="QR" />
          </div>
          <div class="code">${esc(code)}</div>
          <div class="row"><b>প্রাপক:</b> ${esc(o.customer_name)}</div>
          <div class="row"><b>মোবাইল:</b> ${esc(o.phone)}</div>
          <div class="row addr"><b>ঠিকানা:</b> ${esc(o.address)}${o.district ? ", " + esc(o.district) : ""}</div>
          <div class="row"><b>পণ্য:</b> ${items}</div>
          <div class="cod">COD: ৳${o.total_amount}</div>
          <div class="inv">Invoice #${o.order_no}</div>
        </div>`;
    }),
  );

  const html = `<!doctype html>
<html lang="bn"><head><meta charset="utf-8" /><title>Courier Labels</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:10px;font-family:'Hind Siliguri',system-ui,sans-serif;background:#fff;color:#111}
  .sheet{display:flex;flex-wrap:wrap;gap:8px}
  .label{width:340px;border:1.5px dashed #333;border-radius:8px;padding:10px;page-break-inside:avoid}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
  .brand{font-size:20px;font-weight:700}
  .courier{font-size:11px;color:#555}
  .qr{width:88px;height:88px}
  .code{margin-top:4px;font-size:13px;font-weight:700;letter-spacing:.5px}
  .row{font-size:12px;margin-top:3px;line-height:1.35}
  .addr{min-height:32px}
  .cod{margin-top:6px;font-size:15px;font-weight:700;border-top:1px solid #ccc;padding-top:5px}
  .inv{font-size:10px;color:#666}
  @media print{ body{padding:0} .label{border-style:solid} }
</style></head>
<body><div class="sheet">${labels.join("")}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
