import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

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

function barcodeDataUrl(value: string) {
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      height: 70,
      width: 2,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

const digitsOf = (o: LabelOrder) => {
  const raw = (o.courier_consignment_id || "").replace(/\D/g, "");
  if (raw.length >= 6) return raw;
  return String(100000000 + o.order_no * 7919).slice(0, 9);
};

export async function printCourierLabels(orders: LabelOrder[], brand = "Gentsity") {
  if (orders.length === 0) return;

  const dateStr = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const labels = await Promise.all(
    orders.map(async (o) => {
      const code = o.courier_tracking_code || o.courier_consignment_id || `GT${o.order_no}`;
      const invoice = code.toUpperCase();
      const digits = digitsOf(o);
      const qrValue = o.courier_tracking_code
        ? `https://steadfast.com.bd/t/${o.courier_tracking_code}`
        : code;
      const qr = await QRCode.toDataURL(qrValue, { margin: 0, width: 260 });
      const bars = barcodeDataUrl(digits);
      const totalQty = o.order_items.reduce((s, i) => s + i.qty, 0);
      const items = o.order_items
        .map((i) => `${esc(i.color_name)} (${esc(i.size)}) × ${i.qty}`)
        .join(", ");
      return `
        <div class="label">
          <div class="head">
            <div class="brand">RTN &gt; ${esc(brand.toUpperCase())} - ${esc(invoice)}</div>
            <div class="inv">Invoice: #${esc(invoice)}</div>
          </div>
          <div class="barcode">
            ${bars ? `<img src="${bars}" alt="barcode" />` : ""}
            <div class="digits">${esc(digits)}</div>
          </div>
          <div class="box">
            <img class="qr" src="${qr}" alt="QR" />
            <div class="info">
              <div class="ship">শিপিং টু</div>
              <div class="name">${esc(o.customer_name)}</div>
              <div class="phone">${esc(o.phone)}</div>
              <div class="addr">${esc(o.address)}${o.district ? ", " + esc(o.district) : ""}</div>
              <div class="cod"><span>COD Amount:</span><b>৳${o.total_amount}</b></div>
            </div>
          </div>
          <div class="spacer"></div>
          <div class="items">
            <div class="items-title">ITEMS (${o.order_items.length}):</div>
            <div class="items-row">
              <span>• ${items}</span>
              <span class="qty">Qty: ${totalQty}</span>
            </div>
          </div>
          <div class="foot">
            <span>Date: ${esc(dateStr)}</span>
            <span>${esc(brand.toUpperCase())}</span>
          </div>
        </div>`;
    }),
  );

  const html = `<!doctype html>
<html lang="bn"><head><meta charset="utf-8" /><title>Courier Labels</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box}
  @page{size:75mm 75mm;margin:0}
  body{margin:0;padding:6px;font-family:'Hind Siliguri',system-ui,sans-serif;background:#fff;color:#000}
  .sheet{display:flex;flex-wrap:wrap;gap:6px}
  .label{width:75mm;height:75mm;border:1px solid #000;padding:1.5mm 2mm;page-break-inside:avoid;page-break-after:always;display:flex;flex-direction:column;overflow:hidden}
  .head{text-align:center}
  .brand{font-size:8.5px;font-weight:700;letter-spacing:.2px}
  .inv{font-size:7px;margin-top:1px}
  .barcode{text-align:center;margin-top:2px}
  .barcode img{width:100%;height:9mm;object-fit:fill}
  .digits{font-size:7.5px;letter-spacing:1.5px;margin-top:1px}
  .box{margin-top:2mm;border:1px solid #000;padding:1.5mm;display:flex;gap:1.5mm;align-items:flex-start}
  .qr{width:11mm;height:11mm}
  .info{flex:1;min-width:0}
  .ship{font-size:7px}
  .name{font-size:10px;font-weight:700;line-height:1.15}
  .phone{font-size:9px;font-weight:700}
  .addr{font-size:7px;margin-top:1px;line-height:1.25}
  .cod{margin-top:1mm;border-top:1px solid #000;padding-top:2px;display:flex;justify-content:space-between;font-size:8.5px}
  .cod b{font-size:10px}
  .spacer{min-height:2mm;flex:1}
  .items{border-top:1px solid #000;padding-top:2px}
  .items-title{font-size:6.5px;font-weight:700;letter-spacing:.3px}
  .items-row{display:flex;justify-content:space-between;gap:4px;font-size:7px;margin-top:1px}
  .qty{white-space:nowrap;font-weight:700}
  .foot{display:flex;justify-content:space-between;font-size:6.5px;margin-top:2px}
  @media print{ body{padding:0} .sheet{gap:0} .label{border:1px solid #000} }
</style></head>
<body><div class="sheet">${labels.join("")}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
