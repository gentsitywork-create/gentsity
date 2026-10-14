import { z } from "zod";

export const SWEATSHIRT_COMBO_PRICE = 1090;
export const SWEATSHIRT_COMBO_DELIVERY = 0;
export const SWEATSHIRT_COMBO_SIZES = [
  { key: "M", label: "M-38" },
  { key: "L", label: "L-40" },
  { key: "XL", label: "XL-42" },
] as const;

export const sweatshirtComboSchema = z.object({
  customer_name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().regex(/^01[3-9]\d{8}$/),
  address: z.string().trim().max(400).optional().default(""),
  size: z.enum(["M", "L", "XL"]),
  sweatshirt_ids: z.array(z.string().uuid()).length(3).refine(
    (ids) => new Set(ids).size === 3,
    "৩টি আলাদা সোয়েটশার্ট বাছুন।",
  ),
});