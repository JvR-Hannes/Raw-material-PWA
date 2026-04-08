import type { Product, Transaction } from "./types";

export const currency = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR"
});

export const dateTimeFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function safeNumber(value: string | number): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatDate(date: string): string {
  try {
    return dateTimeFormatter.format(new Date(date));
  } catch {
    return date;
  }
}

export function latestUnitCost(product: Product, transactions: Transaction[]): number {
  const latestReceipt = [...transactions]
    .filter((t) => t.productId === product.id && t.type === "received" && typeof t.unitPriceZAR === "number")
    .sort((a, b) => {
      const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (byDate !== 0) return byDate;
      return b.createdAt.localeCompare(a.createdAt);
    })[0];

  return latestReceipt?.unitPriceZAR ?? product.openingUnitCostZAR ?? 0;
}

export function transactionSignedQty(transaction: Transaction): number {
  if (transaction.type === "received") return transaction.quantity;
  if (transaction.type === "issued") return -transaction.quantity;
  if (transaction.type === "adjustment") return transaction.quantity;
  return 0;
}

export function sortTransactionsAscending(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (byDate !== 0) return byDate;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function productStock(product: Product, transactions: Transaction[]): number {
  return sortTransactionsAscending(transactions)
    .filter((t) => t.productId === product.id)
    .reduce((sum, tx) => sum + transactionSignedQty(tx), product.openingQty);
}

export function transactionBalanceAfter(transaction: Transaction, product: Product, transactions: Transaction[]): number {
  const relevant = sortTransactionsAscending(transactions).filter((t) => t.productId === product.id);

  let balance = product.openingQty;
  for (const tx of relevant) {
    balance += transactionSignedQty(tx);
    if (tx.id === transaction.id) return balance;
  }
  return balance;
}

export function inventoryValue(products: Product[], transactions: Transaction[]): number {
  return products.reduce((sum, product) => {
    const qty = productStock(product, transactions);
    const cost = latestUnitCost(product, transactions);
    return sum + qty * cost;
  }, 0);
}

export type DatePreset = "today" | "week" | "month";

export function startOfPeriod(preset: DatePreset): Date {
  const now = new Date();
  if (preset === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (preset === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    return start;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function inPeriod(dateIso: string, preset: DatePreset): boolean {
  return new Date(dateIso).getTime() >= startOfPeriod(preset).getTime();
}

export function periodLabel(preset: DatePreset): string {
  if (preset === "today") return "Today";
  if (preset === "week") return "This Week";
  return "This Month";
}

export function periodTotals(products: Product[], transactions: Transaction[], preset: DatePreset) {
  const productMap = new Map(products.map((p) => [p.id, p]));
  let received = 0;
  let issued = 0;
  let adjustments = 0;

  for (const tx of transactions) {
    if (!inPeriod(tx.date, preset)) continue;
    const product = productMap.get(tx.productId);
    if (!product) continue;
    const cost = tx.type === "received"
      ? tx.unitPriceZAR ?? latestUnitCost(product, transactions)
      : latestUnitCost(product, transactions);

    if (tx.type === "received") received += tx.quantity * cost;
    if (tx.type === "issued") issued += tx.quantity * cost;
    if (tx.type === "adjustment") adjustments += tx.quantity * cost;
  }

  return { received, issued, adjustments };
}

export function countVarianceQty(product: Product, transactions: Transaction[]): number {
  const related = [...transactions]
    .filter((t) => t.productId === product.id && t.type === "adjustment" && t.linkedCountId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return related?.quantity ?? 0;
}

export function latestCountForProduct(product: Product, transactions: Transaction[]) {
  return [...transactions]
    .filter((t) => t.productId === product.id && t.type === "count")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

export function variancePercent(systemQty: number, countedQty: number): number {
  if (systemQty === 0) return countedQty === 0 ? 0 : 100;
  return Math.abs((countedQty - systemQty) / systemQty) * 100;
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
