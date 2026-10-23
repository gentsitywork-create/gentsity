export const ORDER_PAGE_SIZE = 50;

export function orderPage<T>(rows: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / ORDER_PAGE_SIZE));
  const page = Math.max(1, Math.min(requestedPage, pageCount));
  const offset = (page - 1) * ORDER_PAGE_SIZE;
  return { page, pageCount, offset, rows: rows.slice(offset, offset + ORDER_PAGE_SIZE) };
}