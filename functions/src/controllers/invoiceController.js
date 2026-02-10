const { getBucket } = require("../config/firebase");
const { getProductBySku } = require("./productController");
const { stockOut, stockIn } = require("./inventoryController");
const { AppError } = require("./productController");
const companyService = require("../services/companyService");

// Initialize bucket instance
const bucket = getBucket();

async function validateCompanyAccess(companyId) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  const company = await companyService.getCompanyById(companyId);
  if (!company) {
    throw new AppError(404, "Company not found");
  }

  if (company.status !== "ACTIVE") {
    throw new AppError(403, "Access Denied: Your company account is currently suspended.");
  }
}

const getInvoiceFile = (companyId, id) =>
  bucket.file(`companies/${companyId}/invoices/${id}.json`);


async function createInvoice(companyId, data) {
  await validateCompanyAccess(companyId);

  const { customer, items, dueDate, status } = data;
  const invId = `INV-${Date.now()}`;

  let invoiceSubtotal = 0; // Total before tax
  let totalTaxAmount = 0;
  let totalCostOfGoods = 0;
  const finalItems = [];

  for (const item of items) {
    const product = await getProductBySku(companyId, item.sku);
    if (!product) throw new AppError(404, `Product ${item.sku} not found`);

    if (product.stockOnHand < item.quantity) {
      throw new AppError(
        400,
        `Insufficient stock for ${product.name}. Available: ${product.stockOnHand}`
      );
    }

    const sellingPrice = Number(product.sellingPrice);
    const costPrice = Number(product.costPrice);
    const taxPercent = Number(product.taxPercent || 0);

    // Calculate Tax for this item
    const lineSubtotal = item.quantity * sellingPrice;
    const lineTax = lineSubtotal * (taxPercent / 100);
    const lineTotalWithTax = lineSubtotal + lineTax;

    invoiceSubtotal += lineSubtotal;
    totalTaxAmount += lineTax;
    totalCostOfGoods += item.quantity * costPrice;

    finalItems.push({
      sku: item.sku,
      name: product.name,
      quantity: item.quantity,
      sellingPrice,
      costPrice, 
      taxPercent,
      taxAmount: Number(lineTax.toFixed(2)),
      lineSubtotal: Number(lineSubtotal.toFixed(2)),
      lineTotal: Number(lineTotalWithTax.toFixed(2)),
    });
  }

  // Profit is calculated on Subtotal (Revenue minus Cost), excluding Tax
  const grossProfit = invoiceSubtotal - totalCostOfGoods;
  const grandTotal = invoiceSubtotal + totalTaxAmount;

  for (const item of finalItems) {
    await stockOut(companyId, item.sku, {
      quantity: item.quantity,
      note: `Invoice ${invId}`,
    });
  }

  const now = new Date().toISOString();

  const invoice = {
    companyId,
    invoiceNumber: invId,
    customerName: customer.name,
    gst: customer.gst,
    date: now,
    dueDate: status === "Paid" ? null : dueDate,
    paidOn: status === "Paid" ? now : null,
    items: finalItems,
    subtotal: Number(invoiceSubtotal.toFixed(2)),
    totalTax: Number(totalTaxAmount.toFixed(2)),
    totalAmount: Number(grandTotal.toFixed(2)),
    outstandingAmount: status === "Paid" ? 0 : Number(grandTotal.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    status: status === "Paid" ? "Paid" : "Unpaid",
  };

  await getInvoiceFile(companyId, invId).save(JSON.stringify(invoice, null, 2));
  return invoice;
}


async function cancelInvoice(companyId, invoiceNumber) {
  await validateCompanyAccess(companyId);

  const file = getInvoiceFile(companyId, invoiceNumber);
  const [exists] = await file.exists();
  if (!exists) throw new AppError(404, "Invoice not found");

  const [content] = await file.download();
  const invoice = JSON.parse(content.toString());

  if (invoice.status === "Cancelled") {
    throw new AppError(400, "Invoice is already cancelled.");
  }

  await Promise.all(invoice.items.map(item => 
    stockIn(companyId, item.sku, {
      quantity: item.quantity,
      costPerUnit: item.costPrice,
      note: `Rollback: Cancelled ${invoiceNumber}`,
    })
  ));

  invoice.status = "Cancelled";
  invoice.subtotal = 0;
  invoice.totalTax = 0;
  invoice.totalAmount = 0; 
  invoice.outstandingAmount = 0; 
  invoice.grossProfit = 0; 
  invoice.cancelledAt = new Date().toISOString();

  await file.save(JSON.stringify(invoice, null, 2));
  return { success: true, message: "Invoice cancelled", invoice };
}


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
    if (inv.status === "Cancelled") return;

    const invDate = new Date(inv.date);
    summary.totalOutstanding += inv.outstandingAmount || 0;

    if (
      invDate.getMonth() === now.getMonth() &&
      invDate.getFullYear() === now.getFullYear()
    ) {
      // Sales include tax, Profit is pure margin
      summary.monthlySales += inv.totalAmount;
      summary.monthlyProfit += inv.grossProfit || 0;

      inv.items.forEach((item) => {
        summary.topProducts[item.name] =
          (summary.topProducts[item.name] || 0) + item.quantity;
      });
    }
  });

  summary.monthlySales = Number(summary.monthlySales.toFixed(2));
  summary.monthlyProfit = Number(summary.monthlyProfit.toFixed(2));
  summary.totalOutstanding = Number(summary.totalOutstanding.toFixed(2));

  return summary;
}


async function getAllInvoices(companyId) {
  await validateCompanyAccess(companyId);

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

async function recordPayment(companyId, invoiceNumber, paymentData) {
  await validateCompanyAccess(companyId);

  const file = getInvoiceFile(companyId, invoiceNumber);
  const [exists] = await file.exists();

  if (!exists) throw new AppError(404, "Invoice not found");

  const [content] = await file.download();
  const invoice = JSON.parse(content.toString());


  if (invoice.status === "Cancelled") {
    throw new AppError(400, "Cannot record payment for a cancelled invoice.");
  }

  const amountReceived = Number(paymentData.amountReceived);
  if (amountReceived <= 0)
    throw new AppError(400, "Invalid payment amount");

  if (amountReceived > invoice.outstandingAmount)
    throw new AppError(400, "Overpayment not allowed");

  invoice.outstandingAmount = Number(
    (invoice.outstandingAmount - amountReceived).toFixed(2)
  );

  if (invoice.outstandingAmount === 0) {
    invoice.status = "Paid";
    invoice.paidOn = new Date().toISOString();
  }

  await file.save(JSON.stringify(invoice, null, 2));
  return invoice;
}

module.exports = {
  createInvoice,
  cancelInvoice, 
  getAllInvoices,
  getDashboardSummary,
  recordPayment,
};