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

  const company = await getCompanyById(companyId);
  if (!company) {
    throw new AppError(404, "Company not found");
  }

  if (company.status !== "ACTIVE") {
    throw new AppError(
      403,
      "Access Denied: Your company account is currently suspended."
    );
  }
}

/* =========================================================
    🔔 LOW STOCK HELPER
========================================================= */

function getLowStockInfo(product) {
  const isLowStock =
    product.reorderLevel > 0 &&
    product.stockOnHand <= product.reorderLevel;

  return {
    isLowStock,
    lowStockMessage: isLowStock
      ? `Low stock: only ${product.stockOnHand} left (reorder level ${product.reorderLevel})`
      : null,
  };
}

/* =========================================================
    2. PATH HELPERS (Multi-Tenant Scoping)
========================================================= */

const getProductFile = (companyId, sku) =>
  bucket.file(`companies/${companyId}/products/${sku}.json`);

/* =========================================================
    3. PRODUCT OPERATIONS (Company-Scoped)
========================================================= */

async function createProduct(
  companyId,
  { sku, name, category = "", costPrice, sellingPrice = 0, reorderLevel = 0 }
) {
  await validateCompanyAccess(companyId);

  if (!name || costPrice == null)
    throw new AppError(400, "Name and cost price are required");

  const finalCostPrice = Number(parseFloat(costPrice).toFixed(2));
  const finalSellingPrice = Number(parseFloat(sellingPrice).toFixed(2));
  const finalReorderLevel = Number(parseInt(reorderLevel) || 0);

  if (finalCostPrice < 0)
    throw new AppError(400, "Cost price cannot be negative");
  if (finalSellingPrice < 0)
    throw new AppError(400, "Selling price cannot be negative");
  if (finalReorderLevel < 0)
    throw new AppError(400, "Reorder level cannot be negative");

  const finalSku = sku ? String(sku) : `SKU${Date.now()}`;
  const file = getProductFile(companyId, finalSku);

  const [exists] = await file.exists();
  if (exists)
    throw new AppError(
      409,
      "Product SKU already exists in your company catalog"
    );

  const product = {
    companyId,
    sku: finalSku,
    name,
    category,
    costPrice: finalCostPrice,
    sellingPrice: finalSellingPrice,
    reorderLevel: finalReorderLevel,
    stockOnHand: 0,
    averageCost: finalCostPrice,
    inventoryValue: 0,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
  };

  await file.save(JSON.stringify(product, null, 2));
  return product;
}

/**
 * GET ALL PRODUCTS
 */
async function getAllProducts(companyId) {
  await validateCompanyAccess(companyId);

  const [files] = await bucket.getFiles({
    prefix: `companies/${companyId}/products/`,
  });

  const productPromises = files
    .filter((file) => file.name.endsWith(".json"))
    .map(async (file) => {
      try {
        const [contents] = await file.download();
        const product = JSON.parse(contents.toString());
        return {
          ...product,
          ...getLowStockInfo(product),
        };
      } catch (err) {
        console.error(`Failed to parse ${file.name}:`, err.message);
        return null;
      }
    });

  const products = await Promise.all(productPromises);

  return products
    .filter((p) => p !== null)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * GET PRODUCT BY SKU
 */
async function getProductBySku(companyId, sku) {
  await validateCompanyAccess(companyId);

  const file = getProductFile(companyId, sku);
  const [exists] = await file.exists();

  if (!exists) throw new AppError(404, "Product not found");

  try {
    const [contents] = await file.download();
    const product = JSON.parse(contents.toString());
    return {
      ...product,
      ...getLowStockInfo(product),
    };
  } catch {
    throw new AppError(500, `Failed to read product data for SKU ${sku}`);
  }
}

/**
 * GET PRODUCT BY NAME
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
 * UPDATE PRODUCT
 */
async function updateProduct(companyId, sku, updates) {
  await validateCompanyAccess(companyId);

  const product = await getProductBySku(companyId, sku);

  if (updates.costPrice != null)
    updates.costPrice = Number(parseFloat(updates.costPrice).toFixed(2));
  if (updates.sellingPrice != null)
    updates.sellingPrice = Number(
      parseFloat(updates.sellingPrice).toFixed(2)
    );
  if (updates.averageCost != null)
    updates.averageCost = Number(
      parseFloat(updates.averageCost).toFixed(2)
    );
  if (updates.stockOnHand != null)
    updates.stockOnHand = Number(parseInt(updates.stockOnHand));

  if (updates.costPrice < 0 || updates.sellingPrice < 0)
    throw new AppError(400, "Price fields cannot be negative");

  const updatedProduct = {
    ...product,
    ...updates,
    updatedAt: getTimestamp(),
  };

  updatedProduct.inventoryValue = Number(
    (updatedProduct.stockOnHand * updatedProduct.averageCost).toFixed(2)
  );

  await getProductFile(companyId, sku).save(
    JSON.stringify(updatedProduct, null, 2)
  );
  return updatedProduct;
}

/**
 * DELETE PRODUCT
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
