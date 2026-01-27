const { bucket } = require("../config/firebase");
const { getCompanyById } = require("../services/companyService");

/* =========================================================
    1. ERROR HANDLING & UTILS
========================================================= */

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

const getTimestamp = () => new Date().toISOString();

/**
 * 🔒 SECURITY GATE: Ensures the company is ACTIVE.
 * Suspended companies cannot view, create, or edit products.
 */
async function validateCompanyAccess(companyId) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  // Logic: Uses the standardized getCompanyById to prevent 500 errors
  const company = await getCompanyById(companyId);
  if (!company) {
    throw new AppError(404, "Company not found");
  }

  // Multi-tenant rule: Revoke access instantly if status is not ACTIVE
  if (company.status !== "ACTIVE") {
    throw new AppError(403, "Access Denied: Your company account is currently suspended.");
  }
}

/* =========================================================
    2. PATH HELPERS (Multi-Tenant Scoping)
========================================================= */

/** * Rule: Product files are stored in a private folder for each company.
 * Path: companies/{companyId}/products/{sku}.json
 */
const getProductFile = (companyId, sku) =>
  bucket.file(`companies/${companyId}/products/${sku}.json`);

/* =========================================================
    3. PRODUCT OPERATIONS (Company-Scoped)
========================================================= */

/**
 * CREATE PRODUCT: Scoped to the tenant company.
 */
async function createProduct(companyId, {
  sku,
  name,
  category = "",
  costPrice,
  sellingPrice = 0,
  reorderLevel = 0,
}) {
  await validateCompanyAccess(companyId);

  if (!name || costPrice == null)
    throw new AppError(400, "Name and cost price are required");

  costPrice = Number(costPrice);
  sellingPrice = Number(sellingPrice);
  reorderLevel = Number(reorderLevel);

  if (costPrice < 0) throw new AppError(400, "Cost price cannot be negative");
  if (sellingPrice < 0) throw new AppError(400, "Selling price cannot be negative");
  if (reorderLevel < 0) throw new AppError(400, "Reorder level cannot be negative");

  const finalSku = sku ? String(sku) : `SKU${Date.now()}`;
  const file = getProductFile(companyId, finalSku);

  // Check existence ONLY within this company's products
  const [exists] = await file.exists();
  if (exists)
    throw new AppError(409, "Product SKU already exists in your company catalog");

  const product = {
    companyId, // 🔒 Mandatory ownership stamp
    sku: finalSku,
    name,
    category,
    costPrice,
    sellingPrice,
    reorderLevel,
    stockOnHand: 0,
    averageCost: costPrice,
    inventoryValue: 0,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
  };

  await file.save(JSON.stringify(product));
  return product;
}

/**
 * GET ALL PRODUCTS: Returns the catalog for a single company.
 */
async function getAllProducts(companyId) {
  await validateCompanyAccess(companyId);

  // Prefix ensures the server never "leaks" data between companies
  const [files] = await bucket.getFiles({
    prefix: `companies/${companyId}/products/`,
  });

  const products = [];

  for (const file of files) {
    try {
      const [contents] = await file.download();
      const product = JSON.parse(contents.toString());
      products.push(product);
    } catch (err) {
      console.error(`Failed to read/parse ${file.name}:`, err.message);
    }
  }

  return products.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * GET PRODUCT BY SKU: Internal/External lookup for a specific tenant's product.
 */
async function getProductBySku(companyId, sku) {
  await validateCompanyAccess(companyId);

  const file = getProductFile(companyId, sku);
  const [exists] = await file.exists();

  if (!exists) throw new AppError(404, "Product not found");

  try {
    const [contents] = await file.download();
    return JSON.parse(contents.toString());
  } catch {
    throw new AppError(500, `Failed to read product data for SKU ${sku}`);
  }
}

/**
 * GET PRODUCT BY NAME: Utility search for the company dashboard.
 */
async function getProductByName(companyId, name) {
  await validateCompanyAccess(companyId);

  const allProducts = await getAllProducts(companyId);
  const product = allProducts.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );

  if (!product) throw new AppError(404, "Product not found");
  return product;
}

/**
 * UPDATE PRODUCT: Modifies product details while preserving company isolation.
 */
async function updateProduct(companyId, sku, updates) {
  await validateCompanyAccess(companyId);

  const product = await getProductBySku(companyId, sku);

  if (updates.costPrice != null && Number(updates.costPrice) < 0)
    throw new AppError(400, "Cost price cannot be negative");
  if (updates.sellingPrice != null && Number(updates.sellingPrice) < 0)
    throw new AppError(400, "Selling price cannot be negative");
  if (updates.reorderLevel != null && Number(updates.reorderLevel) < 0)
    throw new AppError(400, "Reorder level cannot be negative");

  const updatedProduct = {
    ...product,
    ...updates,
    updatedAt: getTimestamp(),
  };

  await getProductFile(companyId, sku).save(JSON.stringify(updatedProduct));
  return updatedProduct;
}

/**
 * DELETE PRODUCT: Permanently removes a product from the company folder.
 */
async function deleteProduct(companyId, sku) {
  await validateCompanyAccess(companyId);

  const file = getProductFile(companyId, sku);
  const [exists] = await file.exists();

  if (!exists) throw new AppError(404, "Product not found");

  await file.delete();
  return { message: "Product deleted successfully", sku };
}

module.exports = {
  createProduct,
  getAllProducts,
  getProductBySku,
  getProductByName,
  updateProduct,
  deleteProduct,
  AppError,
};