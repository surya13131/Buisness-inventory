const { getAllInvoices } = require("./invoiceController");
const { getAllProducts } = require("./productController");
const { AppError } = require("./productController");


async function getExportData(companyId) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  const invoices = await getAllInvoices(companyId);
  const products = await getAllProducts(companyId);


  const salesReport = invoices
    .filter(inv => inv.status !== "Cancelled")
    .map(inv => ({
      "Date": new Date(inv.date).toLocaleDateString('en-IN'),
      "Invoice #": inv.invoiceNumber,
      "Customer": inv.customerName,
      "GSTIN": inv.gst,
      "Total Amount": Number(inv.totalAmount.toFixed(2)), // Numeric precision fix
      "Status": inv.status.toUpperCase(),
      "Outstanding": Number((inv.outstandingAmount || 0).toFixed(2))
    }));

  const inventoryReport = products.map(p => ({
    "SKU": p.sku,
    "Product Name": p.name,
    "Stock Hand": p.stockOnHand,
    "Avg Cost": Number(p.averageCost.toFixed(2)),
    "Inventory Value": Number((p.stockOnHand * p.averageCost).toFixed(2)),
    "Status": p.stockOnHand <= p.reorderLevel ? "LOW STOCK" : "OK"
  }));

  return { salesReport, inventoryReport };
}

module.exports = { getExportData };