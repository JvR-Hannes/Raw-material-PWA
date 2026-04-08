export type Unit = "kg" | "g" | "L" | "ml" | "pcs" | "packets" | "bags" | "boxes" | "bottles";

export type TransactionType = "received" | "issued" | "count" | "adjustment";

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: Unit;
  location: string;
  minStock: number;
  openingQty: number;
  openingUnitCostZAR: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  productId: string;
  type: TransactionType;
  quantity: number;
  date: string;
  unitPriceZAR?: number;
  supplier?: string;
  department?: string;
  reference?: string;
  note?: string;
  createdAt: string;
  linkedCountId?: string;
}
