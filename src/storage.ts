import type { Product, Transaction } from "./types";

const STORAGE_KEY = "raw-material-stock-pwa-v3";
const LAST_SUPPLIER_KEY = "raw-material-stock-pwa-last-supplier";

export interface AppData {
  products: Product[];
  transactions: Transaction[];
}

export function loadData(defaultData: AppData): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed.products || !parsed.transactions) return defaultData;
    return parsed;
  } catch {
    return defaultData;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadLastSupplier(): string {
  return localStorage.getItem(LAST_SUPPLIER_KEY) ?? "";
}

export function saveLastSupplier(value: string): void {
  if (value.trim()) {
    localStorage.setItem(LAST_SUPPLIER_KEY, value.trim());
  }
}
