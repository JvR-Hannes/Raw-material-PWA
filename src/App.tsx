import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { loadData, loadLastSupplier, saveData, saveLastSupplier, type AppData } from "./storage";
import type { Product, Transaction, TransactionType, Unit } from "./types";
import {
  countVarianceQty,
  currency,
  downloadCsv,
  formatDate,
  inventoryValue,
  inPeriod,
  latestCountForProduct,
  latestUnitCost,
  periodLabel,
  periodTotals,
  productStock,
  safeNumber,
  transactionBalanceAfter,
  transactionSignedQty,
  uid,
  variancePercent,
  type DatePreset
} from "./utils";

type Page = "dashboard" | "products" | "deliveries" | "issues" | "counts" | "history" | "summary";

type ProductRow = {
  product: Product;
  qty: number;
  cost: number;
  value: number;
  varianceQty: number;
  varianceValue: number;
  latestCountedQty: number | null;
};

const defaultData: AppData = {
  products: [],
  transactions: []
};

const units: Unit[] = ["kg", "g", "L", "ml", "pcs", "packets", "bags", "boxes", "bottles"];
const departments = ["Kitchen", "Bar", "Bakery", "Store", "Housekeeping", "Other"];

function todayLocalValue(): string {
  const now = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function App() {
  const [data, setData] = useState<AppData>(defaultData);
  const [page, setPage] = useState<Page>("dashboard");
  const [search, setSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | TransactionType>("all");
  const [historyProductId, setHistoryProductId] = useState<string>("all");
  const [summaryRange, setSummaryRange] = useState<DatePreset>("month");
  const [exportRange, setExportRange] = useState<DatePreset>("month");
  const [message, setMessage] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  const [lastSupplier, setLastSupplier] = useState("");

  const [productForm, setProductForm] = useState({
    code: "",
    name: "",
    category: "",
    unit: "packets" as Unit,
    location: "",
    minStock: 0,
    openingQty: 0,
    openingUnitCostZAR: 0
  });

  const [deliveryForm, setDeliveryForm] = useState({
    productId: "",
    quantity: 0,
    date: todayLocalValue(),
    unitPriceZAR: 0,
    supplier: "",
    reference: "",
    note: ""
  });

  const [issueForm, setIssueForm] = useState({
    productId: "",
    quantity: 0,
    date: todayLocalValue(),
    department: "Kitchen",
    reference: "",
    note: ""
  });

  const [countForm, setCountForm] = useState({
    productId: "",
    quantity: 0,
    date: todayLocalValue(),
    note: ""
  });

  useEffect(() => {
    setData(loadData(defaultData));
    const supplier = loadLastSupplier();
    setLastSupplier(supplier);
    setDeliveryForm((current) => ({ ...current, supplier }));
  }, []);

  useEffect(() => {
    saveData(data);
  }, [data]);

  function showMessage(text: string) {
    setMessage(text);
    setWarning("");
    window.clearTimeout((showMessage as unknown as { timer?: number }).timer);
    (showMessage as unknown as { timer?: number }).timer = window.setTimeout(() => setMessage(""), 4000);
  }

  function showWarning(text: string) {
    setWarning(text);
    setMessage("");
    window.clearTimeout((showWarning as unknown as { timer?: number }).timer);
    (showWarning as unknown as { timer?: number }).timer = window.setTimeout(() => setWarning(""), 5000);
  }

  const products = data.products;
  const transactions = data.transactions;
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const productRows: ProductRow[] = useMemo(() => {
    return products
      .filter((product) => {
        const haystack = `${product.code} ${product.name} ${product.category} ${product.location}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .map((product) => {
        const qty = productStock(product, transactions);
        const cost = latestUnitCost(product, transactions);
        const varianceQty = countVarianceQty(product, transactions);
        const latestCount = latestCountForProduct(product, transactions);
        return {
          product,
          qty,
          cost,
          value: qty * cost,
          varianceQty,
          varianceValue: varianceQty * cost,
          latestCountedQty: latestCount?.quantity ?? null
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [products, search, transactions]);

  const summaryTotals = useMemo(() => {
    const totalValue = inventoryValue(products, transactions);
    const lowStockCount = productRows.filter((row) => row.qty <= row.product.minStock).length;
    const varianceCount = productRows.filter((row) => row.varianceQty !== 0).length;
    const period = periodTotals(products, transactions, summaryRange);
    return {
      totalValue,
      lowStockCount,
      varianceCount,
      received: period.received,
      issued: period.issued,
      adjustments: period.adjustments
    };
  }, [products, productRows, summaryRange, transactions]);

  const historyRows = useMemo(() => {
    return [...transactions]
      .filter((tx) => (historyFilter === "all" || tx.type === historyFilter))
      .filter((tx) => (historyProductId === "all" || tx.productId === historyProductId))
      .sort((a, b) => {
        const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (byDate !== 0) return byDate;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [transactions, historyFilter, historyProductId]);

  const countPreview = useMemo(() => {
    const product = productMap.get(countForm.productId);
    if (!product) return null;
    const systemQty = productStock(product, transactions);
    const percent = variancePercent(systemQty, countForm.quantity);
    return { product, systemQty, varianceQty: countForm.quantity - systemQty, percent };
  }, [countForm.productId, countForm.quantity, productMap, transactions]);

  const stockTakeRows = useMemo(() => {
    return productRows
      .filter((row) => row.latestCountedQty !== null)
      .map((row) => ({
        ...row,
        expectedQty: row.qty - row.varianceQty,
        countedQty: row.latestCountedQty ?? 0
      }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [productRows]);

  function addProduct(event: FormEvent) {
    event.preventDefault();
    if (!productForm.name.trim() || !productForm.code.trim()) {
      showWarning("Product code and name are required.");
      return;
    }

    const product: Product = {
      id: uid("prod"),
      code: productForm.code.trim(),
      name: productForm.name.trim(),
      category: productForm.category.trim() || "General",
      unit: productForm.unit,
      location: productForm.location.trim(),
      minStock: safeNumber(productForm.minStock),
      openingQty: safeNumber(productForm.openingQty),
      openingUnitCostZAR: safeNumber(productForm.openingUnitCostZAR),
      createdAt: new Date().toISOString()
    };

    setData((current) => ({ ...current, products: [product, ...current.products] }));
    setProductForm({
      code: "",
      name: "",
      category: "",
      unit: "packets",
      location: "",
      minStock: 0,
      openingQty: 0,
      openingUnitCostZAR: 0
    });
    showMessage(`Saved product: ${product.name}`);
  }

  function appendTransactions(newTransactions: Transaction[]) {
    setData((current) => ({ ...current, transactions: [...newTransactions, ...current.transactions] }));
  }

  function submitDelivery(event: FormEvent) {
    event.preventDefault();
    if (!deliveryForm.productId) {
      showWarning("Select a product for the delivery.");
      return;
    }
    if (deliveryForm.quantity <= 0) {
      showWarning("Delivery quantity must be more than 0.");
      return;
    }
    if (deliveryForm.unitPriceZAR <= 0) {
      showWarning("Unit price must be more than R0.00.");
      return;
    }

    appendTransactions([
      {
        id: uid("tx"),
        type: "received",
        createdAt: new Date().toISOString(),
        productId: deliveryForm.productId,
        quantity: safeNumber(deliveryForm.quantity),
        date: new Date(deliveryForm.date).toISOString(),
        unitPriceZAR: safeNumber(deliveryForm.unitPriceZAR),
        supplier: deliveryForm.supplier.trim(),
        reference: deliveryForm.reference.trim(),
        note: deliveryForm.note.trim()
      }
    ]);
    if (deliveryForm.supplier.trim()) {
      saveLastSupplier(deliveryForm.supplier);
      setLastSupplier(deliveryForm.supplier.trim());
    }
    setDeliveryForm({
      productId: "",
      quantity: 0,
      date: todayLocalValue(),
      unitPriceZAR: 0,
      supplier: deliveryForm.supplier.trim() || lastSupplier,
      reference: "",
      note: ""
    });
    showMessage("Delivery recorded.");
    setPage("history");
  }

  function applyQuickIssue(quantity: number) {
    setIssueForm((current) => ({ ...current, quantity }));
  }

  function submitIssue(event: FormEvent) {
    event.preventDefault();
    if (!issueForm.productId) {
      showWarning("Select a product to issue.");
      return;
    }
    if (issueForm.quantity <= 0) {
      showWarning("Issue quantity must be more than 0.");
      return;
    }
    const product = productMap.get(issueForm.productId);
    if (!product) return;
    const available = productStock(product, transactions);
    const requested = safeNumber(issueForm.quantity);
    if (requested > available) {
      showWarning(`Cannot issue ${requested} ${product.unit}. Only ${available} ${product.unit} available.`);
      return;
    }

    appendTransactions([
      {
        id: uid("tx"),
        type: "issued",
        createdAt: new Date().toISOString(),
        productId: issueForm.productId,
        quantity: requested,
        date: new Date(issueForm.date).toISOString(),
        department: issueForm.department.trim(),
        reference: issueForm.reference.trim(),
        note: issueForm.note.trim()
      }
    ]);
    setIssueForm({
      productId: "",
      quantity: 0,
      date: todayLocalValue(),
      department: "Kitchen",
      reference: "",
      note: ""
    });
    showMessage("Issue recorded.");
    setPage("history");
  }

  function submitCount(event: FormEvent) {
    event.preventDefault();
    if (!countForm.productId) {
      showWarning("Select a product to count.");
      return;
    }
    if (countForm.quantity < 0) {
      showWarning("Counted quantity cannot be negative.");
      return;
    }
    const product = productMap.get(countForm.productId);
    if (!product) return;

    const countedQty = safeNumber(countForm.quantity);
    const systemQty = productStock(product, transactions);
    const difference = countedQty - systemQty;
    const variancePct = variancePercent(systemQty, countedQty);
    const countId = uid("tx");
    const countDateIso = new Date(countForm.date).toISOString();

    const newTransactions: Transaction[] = [
      {
        id: countId,
        type: "count",
        createdAt: new Date().toISOString(),
        productId: countForm.productId,
        quantity: countedQty,
        date: countDateIso,
        note: countForm.note.trim() || `Physical count recorded. System quantity was ${systemQty}.`
      }
    ];

    if (difference !== 0) {
      newTransactions.push({
        id: uid("tx"),
        type: "adjustment",
        createdAt: new Date().toISOString(),
        productId: countForm.productId,
        quantity: difference,
        date: countDateIso,
        linkedCountId: countId,
        note: `Adjustment from count. System ${systemQty}, counted ${countedQty}.`
      });
    }

    appendTransactions(newTransactions);
    setCountForm({ productId: "", quantity: 0, date: todayLocalValue(), note: "" });

    if (variancePct > 20) {
      showWarning(`Count recorded, but variance is ${variancePct.toFixed(1)}%. Please investigate this item.`);
    } else {
      showMessage(
        difference === 0
          ? "Count recorded. No variance found."
          : `Count recorded. Adjustment of ${difference > 0 ? "+" : ""}${difference} created.`
      );
    }
    setPage("history");
  }

  function exportInventorySnapshot() {
    const rows: Array<Array<string | number>> = [[
      "Product", "Code", "On Hand Qty", "Unit", "Latest Unit Price ZAR", "Current Stock Value ZAR", "Location", "Low Stock"
    ]];
    for (const row of productRows) {
      rows.push([
        row.product.name,
        row.product.code,
        row.qty,
        row.product.unit,
        row.cost,
        row.value,
        row.product.location,
        row.qty <= row.product.minStock ? "Yes" : "No"
      ]);
    }
    rows.push([]);
    rows.push(["Total Inventory Value", summaryTotals.totalValue]);
    downloadCsv(`inventory-snapshot-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportMovementHistory() {
    const rows: Array<Array<string | number>> = [[
      "Date", "Product", "Code", "Type", "Movement Qty", "Unit", "Unit Price ZAR", "Supplier", "Department", "Reference", "Note"
    ]];
    for (const tx of transactions.filter((item) => inPeriod(item.date, exportRange)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
      const product = productMap.get(tx.productId);
      if (!product) continue;
      rows.push([
        formatDate(tx.date),
        product.name,
        product.code,
        tx.type,
        tx.type === "count" ? tx.quantity : transactionSignedQty(tx),
        product.unit,
        tx.unitPriceZAR ?? "",
        tx.supplier ?? "",
        tx.department ?? "",
        tx.reference ?? "",
        tx.note ?? ""
      ]);
    }
    downloadCsv(`movement-history-${exportRange}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportStockTakeReport() {
    const rows: Array<Array<string | number>> = [[
      "Product", "Code", "Expected Qty", "Counted Qty", "Variance Qty", "Unit", "Latest Unit Price ZAR", "Variance Value ZAR"
    ]];
    for (const row of stockTakeRows) {
      rows.push([
        row.product.name,
        row.product.code,
        row.expectedQty,
        row.countedQty,
        row.varianceQty,
        row.product.unit,
        row.cost,
        row.varianceValue
      ]);
    }
    downloadCsv(`stock-take-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1>Raw Material Stock</h1>
          <p className="muted">Offline-first stock count and valuation app</p>
        </div>

        <nav className="nav">
          {[
            ["dashboard", "Dashboard"],
            ["products", "Products"],
            ["deliveries", "Record Delivery"],
            ["issues", "Record Issue"],
            ["counts", "Stock Count"],
            ["history", "Movement History"],
            ["summary", "Summary"]
          ].map(([key, label]) => (
            <button key={key} className={page === key ? "nav-btn active" : "nav-btn"} onClick={() => setPage(key as Page)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <div className="small-label">Total Inventory Value</div>
          <div className="sidebar-total">{currency.format(summaryTotals.totalValue)}</div>
          <div className="muted small">South African Rand (ZAR)</div>
          <div className="install-hint">Installable as a home-screen app. Your entries continue to work offline in the browser cache.</div>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div>
            <h2>
              {page === "dashboard" && "Dashboard"}
              {page === "products" && "Products"}
              {page === "deliveries" && "Record Delivery"}
              {page === "issues" && "Record Issue"}
              {page === "counts" && "Stock Count"}
              {page === "history" && "Movement History"}
              {page === "summary" && "Inventory Summary"}
            </h2>
            <p className="muted">Capture deliveries, issues, counts, running balances, and live inventory valuation in ZAR.</p>
          </div>
          <div className="header-actions">
            <input className="input" placeholder="Search products" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </header>

        {message && <div className="notice success">{message}</div>}
        {warning && <div className="notice warning">{warning}</div>}

        {page === "dashboard" && (
          <>
            <section className="stats-grid">
              <Metric title="Products" value={String(products.length)} />
              <Metric title="Low Stock" value={String(summaryTotals.lowStockCount)} />
              <Metric title="Count Variances" value={String(summaryTotals.varianceCount)} />
              <Metric title={`${periodLabel(summaryRange)} Received`} value={currency.format(summaryTotals.received)} />
            </section>

            <section className="panel">
              <div className="panel-header inline-controls">
                <h3>Current Stock Snapshot</h3>
                <div className="segment">
                  {(["today", "week", "month"] as DatePreset[]).map((preset) => (
                    <button key={preset} className={summaryRange === preset ? "seg-btn active" : "seg-btn"} onClick={() => setSummaryRange(preset)}>
                      {periodLabel(preset)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>On Hand</th>
                      <th>Unit</th>
                      <th>Latest Cost</th>
                      <th>Value</th>
                      <th>Last Variance</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((row) => (
                      <tr key={row.product.id}>
                        <td><strong>{row.product.name}</strong><div className="tiny">{row.product.code}</div></td>
                        <td>{row.qty}</td>
                        <td>{row.product.unit}</td>
                        <td>{currency.format(row.cost)}</td>
                        <td>{currency.format(row.value)}</td>
                        <td>
                          <span className={row.varianceQty < 0 ? "variance-badge negative" : row.varianceQty > 0 ? "variance-badge positive" : "variance-badge"}>
                            {row.varianceQty > 0 ? "+" : ""}{row.varianceQty} {row.product.unit}
                          </span>
                        </td>
                        <td>{row.product.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {page === "products" && (
          <div className="grid-2">
            <section className="panel">
              <div className="panel-header"><h3>Add Product</h3></div>
              <form className="form-grid" onSubmit={addProduct}>
                <Field label="Code"><input className="input" value={productForm.code} onChange={(event) => setProductForm({ ...productForm, code: event.target.value })} /></Field>
                <Field label="Name"><input className="input" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></Field>
                <Field label="Category"><input className="input" value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} /></Field>
                <Field label="Unit">
                  <select className="input" value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value as Unit })}>
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </Field>
                <Field label="Storage Location"><input className="input" value={productForm.location} onChange={(event) => setProductForm({ ...productForm, location: event.target.value })} /></Field>
                <Field label="Minimum Stock"><input className="input" type="number" min="0" value={productForm.minStock} onChange={(event) => setProductForm({ ...productForm, minStock: safeNumber(event.target.value) })} /></Field>
                <Field label="Opening Quantity"><input className="input" type="number" min="0" value={productForm.openingQty} onChange={(event) => setProductForm({ ...productForm, openingQty: safeNumber(event.target.value) })} /></Field>
                <Field label="Opening Unit Cost (ZAR)"><input className="input" type="number" min="0" step="0.01" value={productForm.openingUnitCostZAR} onChange={(event) => setProductForm({ ...productForm, openingUnitCostZAR: safeNumber(event.target.value) })} /></Field>
                <div className="full-width"><button className="btn primary" type="submit">Save Product</button></div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header"><h3>Product Register</h3></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th>Min</th><th>On Hand</th><th>Cost</th><th>Value</th><th>Status</th></tr></thead>
                  <tbody>
                    {productRows.map((row) => (
                      <tr key={row.product.id}>
                        <td><strong>{row.product.name}</strong><div className="tiny">{row.product.location || "No location"}</div></td>
                        <td>{row.product.minStock} {row.product.unit}</td>
                        <td>{row.qty} {row.product.unit}</td>
                        <td>{currency.format(row.cost)}</td>
                        <td>{currency.format(row.value)}</td>
                        <td>{row.qty <= row.product.minStock ? <span className="pill adjustment">Low Stock</span> : <span className="pill received">OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {page === "deliveries" && (
          <section className="panel">
            <div className="panel-header inline-controls">
              <h3>Record Delivery / Stock Received</h3>
              {lastSupplier && <button className="btn" type="button" onClick={() => setDeliveryForm((current) => ({ ...current, supplier: lastSupplier }))}>Use last supplier: {lastSupplier}</button>}
            </div>
            <form className="form-grid" onSubmit={submitDelivery}>
              <Field label="Product">
                <select className="input" value={deliveryForm.productId} onChange={(event) => setDeliveryForm({ ...deliveryForm, productId: event.target.value })}>
                  <option value="">Select product</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.code})</option>)}
                </select>
              </Field>
              <Field label="Quantity Received"><input className="input" type="number" min="0" value={deliveryForm.quantity} onChange={(event) => setDeliveryForm({ ...deliveryForm, quantity: safeNumber(event.target.value) })} /></Field>
              <Field label="Date and Time"><input className="input" type="datetime-local" value={deliveryForm.date} onChange={(event) => setDeliveryForm({ ...deliveryForm, date: event.target.value })} /></Field>
              <Field label="Unit Price (ZAR)"><input className="input" type="number" min="0" step="0.01" value={deliveryForm.unitPriceZAR} onChange={(event) => setDeliveryForm({ ...deliveryForm, unitPriceZAR: safeNumber(event.target.value) })} /></Field>
              <Field label="Supplier"><input className="input" value={deliveryForm.supplier} onChange={(event) => setDeliveryForm({ ...deliveryForm, supplier: event.target.value })} /></Field>
              <Field label="Invoice / Delivery Note"><input className="input" value={deliveryForm.reference} onChange={(event) => setDeliveryForm({ ...deliveryForm, reference: event.target.value })} /></Field>
              <Field className="full-width" label="Note"><textarea className="input textarea" value={deliveryForm.note} onChange={(event) => setDeliveryForm({ ...deliveryForm, note: event.target.value })} /></Field>
              <div className="full-width"><button className="btn primary" type="submit">Save Delivery</button></div>
            </form>
          </section>
        )}

        {page === "issues" && (
          <section className="panel">
            <div className="panel-header"><h3>Record Stock Issued</h3></div>
            <form className="form-grid" onSubmit={submitIssue}>
              <Field label="Product">
                <select className="input" value={issueForm.productId} onChange={(event) => setIssueForm({ ...issueForm, productId: event.target.value })}>
                  <option value="">Select product</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.code})</option>)}
                </select>
              </Field>
              <Field label="Quantity Issued"><input className="input" type="number" min="0" value={issueForm.quantity} onChange={(event) => setIssueForm({ ...issueForm, quantity: safeNumber(event.target.value) })} /></Field>
              <Field label="Quick Issue Buttons">
                <div className="quick-actions">
                  <button className="btn" type="button" onClick={() => applyQuickIssue(1)}>Issue 1</button>
                  <button className="btn" type="button" onClick={() => applyQuickIssue(5)}>Issue 5</button>
                </div>
              </Field>
              <Field label="Date and Time"><input className="input" type="datetime-local" value={issueForm.date} onChange={(event) => setIssueForm({ ...issueForm, date: event.target.value })} /></Field>
              <Field label="Department / Taken By">
                <select className="input" value={issueForm.department} onChange={(event) => setIssueForm({ ...issueForm, department: event.target.value })}>
                  {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
              </Field>
              <Field label="Reference"><input className="input" value={issueForm.reference} onChange={(event) => setIssueForm({ ...issueForm, reference: event.target.value })} /></Field>
              <Field className="full-width" label="Note"><textarea className="input textarea" value={issueForm.note} onChange={(event) => setIssueForm({ ...issueForm, note: event.target.value })} /></Field>
              <div className="full-width"><button className="btn primary" type="submit">Save Issue</button></div>
            </form>
          </section>
        )}

        {page === "counts" && (
          <section className="panel">
            <div className="panel-header"><h3>Record Physical Count</h3></div>
            <form className="form-grid" onSubmit={submitCount}>
              <Field label="Product">
                <select className="input" value={countForm.productId} onChange={(event) => setCountForm({ ...countForm, productId: event.target.value })}>
                  <option value="">Select product</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.code})</option>)}
                </select>
              </Field>
              <Field label="Counted Quantity"><input className="input" type="number" min="0" value={countForm.quantity} onChange={(event) => setCountForm({ ...countForm, quantity: safeNumber(event.target.value) })} /></Field>
              <Field label="Date and Time"><input className="input" type="datetime-local" value={countForm.date} onChange={(event) => setCountForm({ ...countForm, date: event.target.value })} /></Field>
              <Field label="System Quantity"><input className="input" value={countPreview ? `${countPreview.systemQty}` : "Select a product"} disabled /></Field>
              {countPreview && (
                <div className="full-width callout">
                  Variance preview: <strong>{countPreview.varianceQty > 0 ? "+" : ""}{countPreview.varianceQty} {countPreview.product.unit}</strong>
                  {countPreview.percent > 20 && <span className="warn-inline"> Warning: this is a {countPreview.percent.toFixed(1)}% variance.</span>}
                </div>
              )}
              <Field className="full-width" label="Count Note"><textarea className="input textarea" value={countForm.note} onChange={(event) => setCountForm({ ...countForm, note: event.target.value })} /></Field>
              <div className="full-width"><button className="btn primary" type="submit">Save Count</button></div>
            </form>
          </section>
        )}

        {page === "history" && (
          <section className="panel">
            <div className="panel-header inline-controls">
              <h3>Movement History</h3>
              <div className="filter-row">
                <select className="input slim" value={historyProductId} onChange={(event) => setHistoryProductId(event.target.value)}>
                  <option value="all">All Products</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                <select className="input slim" value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value as "all" | TransactionType)}>
                  <option value="all">All Types</option>
                  <option value="received">Received</option>
                  <option value="issued">Issued</option>
                  <option value="count">Count</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Movement</th><th>Running Balance</th><th>Details</th></tr></thead>
                <tbody>
                  {historyRows.map((tx) => {
                    const product = productMap.get(tx.productId);
                    if (!product) return null;
                    const balance = transactionBalanceAfter(tx, product, transactions);
                    const signedQty = transactionSignedQty(tx);
                    return (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.date)}</td>
                        <td><span className={`pill ${tx.type}`}>{tx.type}</span></td>
                        <td>{product.name}</td>
                        <td>{tx.type === "count" ? `${tx.quantity} ${product.unit} counted` : `${signedQty > 0 ? "+" : ""}${signedQty} ${product.unit}`}</td>
                        <td>{balance} {product.unit}</td>
                        <td>
                          {tx.type === "received" && <div>{tx.supplier || "Supplier not entered"}<br /><span className="tiny">{tx.reference || "No ref"} • {currency.format(tx.unitPriceZAR ?? 0)}</span></div>}
                          {tx.type === "issued" && <div>{tx.department || "Department not entered"}<br /><span className="tiny">{tx.reference || tx.note || "No note"}</span></div>}
                          {tx.type === "count" && <span className="tiny">{tx.note || "Physical stock count"}</span>}
                          {tx.type === "adjustment" && <span className="tiny">{tx.note || "Adjustment after count"}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === "summary" && (
          <>
            <section className="stats-grid">
              <Metric title="Total Inventory Value" value={currency.format(summaryTotals.totalValue)} />
              <Metric title={`${periodLabel(summaryRange)} Received`} value={currency.format(summaryTotals.received)} />
              <Metric title={`${periodLabel(summaryRange)} Issued`} value={currency.format(summaryTotals.issued)} />
              <Metric title={`${periodLabel(summaryRange)} Adjustments`} value={currency.format(summaryTotals.adjustments)} />
            </section>

            <section className="panel">
              <div className="panel-header inline-controls">
                <h3>Consumption Dashboard</h3>
                <div className="segment">
                  {(["today", "week", "month"] as DatePreset[]).map((preset) => (
                    <button key={preset} className={summaryRange === preset ? "seg-btn active" : "seg-btn"} onClick={() => setSummaryRange(preset)}>
                      {periodLabel(preset)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th>Qty On Hand</th><th>Unit</th><th>Latest Unit Price</th><th>Total Value</th><th>Latest Variance</th><th>Variance Value</th><th>Last Known Location</th></tr></thead>
                  <tbody>
                    {productRows.map((row) => (
                      <tr key={row.product.id}>
                        <td><strong>{row.product.name}</strong><div className="tiny">{row.product.code}</div></td>
                        <td>{row.qty}</td>
                        <td>{row.product.unit}</td>
                        <td>{currency.format(row.cost)}</td>
                        <td>{currency.format(row.value)}</td>
                        <td><span className={row.varianceQty < 0 ? "variance-badge negative" : row.varianceQty > 0 ? "variance-badge positive" : "variance-badge"}>{row.varianceQty > 0 ? "+" : ""}{row.varianceQty} {row.product.unit}</span></td>
                        <td>{currency.format(row.varianceValue)}</td>
                        <td>{row.product.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={4}><strong>Total Inventory Value</strong></td><td><strong>{currency.format(summaryTotals.totalValue)}</strong></td><td colSpan={3} /></tr></tfoot>
                </table>
              </div>
            </section>

            <section className="grid-2 export-grid">
              <div className="panel">
                <div className="panel-header"><h3>Export Reports</h3></div>
                <div className="stack gap-sm">
                  <Field label="Date filter for movement export">
                    <select className="input" value={exportRange} onChange={(event) => setExportRange(event.target.value as DatePreset)}>
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
                    </select>
                  </Field>
                  <div className="quick-actions vertical">
                    <button className="btn" onClick={exportInventorySnapshot}>Export Inventory Snapshot</button>
                    <button className="btn" onClick={exportMovementHistory}>Export Movement History</button>
                    <button className="btn" onClick={exportStockTakeReport}>Export Stock Take Report</button>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header"><h3>Stock Take Report</h3></div>
                <div className="table-wrap small-table">
                  <table>
                    <thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Variance Value</th></tr></thead>
                    <tbody>
                      {stockTakeRows.length === 0 && <tr><td colSpan={5}>No count sessions yet.</td></tr>}
                      {stockTakeRows.map((row) => (
                        <tr key={row.product.id}>
                          <td>{row.product.name}</td>
                          <td>{row.expectedQty} {row.product.unit}</td>
                          <td>{row.countedQty} {row.product.unit}</td>
                          <td><span className={row.varianceQty < 0 ? "variance-badge negative" : row.varianceQty > 0 ? "variance-badge positive" : "variance-badge"}>{row.varianceQty > 0 ? "+" : ""}{row.varianceQty}</span></td>
                          <td>{currency.format(row.varianceValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="metric"><div className="small-label">{title}</div><div className="metric-value">{value}</div></div>;
}

export default App;
