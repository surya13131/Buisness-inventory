const { bucket } = require("../config/firebase");
const { getProductBySku } = require("./productController");
const { stockOut } = require("./inventoryController");
const { AppError } = require("./productController");
const companyService = require("../services/companyService"); 

/* =========================================================
    1. ACCESS VALIDATION (The Security Gate)
========================================================= */

/**
 * Validates that the company exists and is ACTIVE.
 * Suspended companies are blocked from all financial operations.
 */
async function validateCompanyAccess(companyId) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  // Uses the standardized getCompanyById to prevent 500 naming errors
  const company = await companyService.getCompanyById(companyId);
  if (!company) {
    throw new AppError(404, "Company not found");
  }

  // Multi-tenant rule: Block suspended businesses from making sales
  if (company.status !== "ACTIVE") {
    throw new AppError(403, "Access Denied: Your company account is currently suspended.");
  }
}

/* =========================================================
    2. PATH HELPERS (Multi-Tenant Scoping)
========================================================= */

/** * Rule: Invoices are stored in a private folder for each company
 * Path: companies/{companyId}/invoices/{id}.json
 */
const getInvoiceFile = (companyId, id) =>
  bucket.file(`companies/${companyId}/invoices/${id}.json`);

/* =========================================================
    3. INVOICE OPERATIONS
========================================================= */

/**
 * CREATE INVOICE: Handles stock deduction and profit calculation.
 * 🔒 Stamped with companyId to ensure data isolation.
 */
async function createInvoice(companyId, data) {
  await validateCompanyAccess(companyId);

  const { customer, items, dueDate, status } = data;
  const invId = `INV-${Date.now()}`;

  let invoiceTotal = 0;
  let totalCostOfGoods = 0;
  const finalItems = [];

  for (const item of items) {
    const product = await getProductBySku(companyId, item.sku);
    if (!product) throw new AppError(404, `Product ${item.sku} not found`);

    // Guard: Prevent selling more than what is in stock
    if (product.stockOnHand < item.quantity) {
      throw new AppError(
        400,
        `Insufficient stock for ${product.name}. Available: ${product.stockOnHand}`
      );
    }

    const sellingPrice = Number(product.sellingPrice);
    const costPrice = Number(product.costPrice); 

    invoiceTotal += item.quantity * sellingPrice;
    totalCostOfGoods += item.quantity * costPrice;

    finalItems.push({
      sku: item.sku,
      name: product.name,
      quantity: item.quantity,
      sellingPrice,
      lineTotal: item.quantity * sellingPrice,
    });
  }

  // Profit Calculation: $grossProfit = \text{invoiceTotal} - \text{totalCostOfGoods}$
  const grossProfit = invoiceTotal - totalCostOfGoods;

  // 🔒 Deduct stock: Strictly scoped to the same companyId
  for (const item of finalItems) {
    await stockOut(companyId, item.sku, {
      quantity: item.quantity,
      note: `Invoice ${invId}`,
    });
  }

  const now = new Date().toISOString();

  const invoice = {
    companyId, // 🔒 Ownership stamp mandatory for multi-tenant isolation
    invoiceNumber: invId,
    customerName: customer.name,
    gst: customer.gst,
    date: now,
    dueDate: status === "Paid" ? null : dueDate,
    paidOn: status === "Paid" ? now : null,
    items: finalItems,
    totalAmount: Number(invoiceTotal.toFixed(2)),
    outstandingAmount:
      status === "Paid" ? 0 : Number(invoiceTotal.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    status: status === "Paid" ? "Paid" : "Unpaid",
  };

  await getInvoiceFile(companyId, invId).save(JSON.stringify(invoice));
  return invoice;
}

/**
 * DASHBOARD SUMMARY: Calculates KPIs for the current month.
 * 🔒 Only aggregates invoices for the specific companyId.
 */
async function getDashboardSummary(companyId) {
  await validateCompanyAccess(companyId);

  const invoices = await getAllInvoices(companyId);
  const now = new Date();

  const summary = {
    monthlySales: 0,
    monthlyProfit: 0,
    totalOutstanding: 0,
    topProducts: {},
  };

  invoices.forEach((inv) => {
    const invDate = new Date(inv.date);

    // Only count outstanding amounts for non-cancelled invoices
    if (inv.status !== "Cancelled") {
      summary.totalOutstanding += inv.outstandingAmount || 0;
    }

    // Current Month Filtering Logic
    if (
      invDate.getMonth() === now.getMonth() &&
      invDate.getFullYear() === now.getFullYear()
    ) {
      summary.monthlySales += inv.totalAmount;
      summary.monthlyProfit += inv.grossProfit || 0;

      inv.items.forEach((item) => {
        summary.topProducts[item.name] =
          (summary.topProducts[item.name] || 0) + item.quantity;
      });
    }
  });

  return summary;
}

/**
 * GET ALL INVOICES: Lists all documents in the company's invoice folder.
 *
 */
async function getAllInvoices(companyId) {
  await validateCompanyAccess(companyId);

  // Prefix ensures the server never "leaks" data between companies
  const [files] = await bucket.getFiles({
    prefix: `companies/${companyId}/invoices/`,
  });

  const invoices = [];

  for (const file of files) {
    try {
      const [content] = await file.download();
      invoices.push(JSON.parse(content.toString()));
    } catch (err) {
      console.error(`Failed to read invoice file ${file.name}:`, err.message);
    }
  }

  return invoices.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
}

/**
 * RECORD PAYMENT: Updates outstanding balance for a specific invoice.
 */
async function recordPayment(companyId, invoiceNumber, paymentData) {
  await validateCompanyAccess(companyId);

  const file = getInvoiceFile(companyId, invoiceNumber);
  const [exists] = await file.exists();

  if (!exists) throw new AppError(404, "Invoice not found");

  const [content] = await file.download();
  const invoice = JSON.parse(content.toString());

  const amountReceived = Number(paymentData.amountReceived);
  if (amountReceived <= 0)
    throw new AppError(400, "Invalid payment amount");

  // Prevent overpayment to keep financial records accurate
  if (amountReceived > invoice.outstandingAmount)
    throw new AppError(400, "Overpayment not allowed");

  invoice.outstandingAmount = Number(
    (invoice.outstandingAmount - amountReceived).toFixed(2)
  );

  // Auto-status update once balance reaches zero
  if (invoice.outstandingAmount === 0) {
    invoice.status = "Paid";
    invoice.paidOn = new Date().toISOString();
  }

  await file.save(JSON.stringify(invoice));
  return invoice;
}

module.exports = {
  createInvoice,
  getAllInvoices,
  getDashboardSummary,
  recordPayment,
};