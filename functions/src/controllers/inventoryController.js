const { bucket } = require("../config/firebase");
const { getProductBySku, updateProduct, AppError } = require("./productController");

/* =========================================================
    1. PATH HELPERS (Company Scoping)
========================================================= */

/**
 * Rule: Movement history is nested under the specific company folder.
 * Path: companies/{companyId}/movements/{sku}.json
 */
const getMovementFile = (companyId, sku) =>
  bucket.file(`companies/${companyId}/movements/${sku}.json`);

/* =========================================================
    2. CORE AUDIT LOGIC
========================================================= */

/**
 * Internal helper to record every stock change.
 * Ensures an audit trail exists ONLY for the relevant company.
 */
async function recordMovement(
  companyId,
  product,
  { type, quantity, costPerUnit = null, note = "", date = null }
) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  const file = getMovementFile(companyId, product.sku);
  let history = [];

  try {
    const [exists] = await file.exists();
    if (exists) {
      const [contents] = await file.download();
      try {
        history = JSON.parse(contents.toString());
      } catch (err) {
        console.error(
          `Corrupted movement file for ${product.sku}, starting fresh.`
        );
      }
    }
  } catch (err) {
    console.error(
      `Error reading movement file for ${product.sku}:`,
      err.message
    );
  }

  // Auto-generate note if empty
  if (!note) {
    if (type === "Stock Adjustment") note = "Manual stock adjustment";
    else if (type === "Stock Out") note = `Sold ${quantity} unit(s)`;
    else if (type === "Stock In") note = `Stock added`;
  }

  const auditNote =
    type === "Stock In"
      ? `Stock In of ${quantity} unit(s)` +
        (costPerUnit !== null ? ` at cost ${costPerUnit}` : "") +
        (note ? `: ${note}` : "")
      : type === "Stock Out"
      ? `Stock Out of ${quantity} unit(s)` + (note ? `: ${note}` : "")
      : `Stock Adjustment of ${quantity} unit(s)` +
        (note ? `: ${note}` : "");

  // Rule: Ownership stamp must be included in every entry.
  history.push({
    companyId,
    sku: product.sku,
    productName: product.name,
    type,
    quantity,
    costPerUnit:
      costPerUnit !== null ? Number(costPerUnit) : product.averageCost,
    note: auditNote,
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    stockOnHandAfter: product.stockOnHand,
    inventoryValueAfter: product.inventoryValue,
    averageCostAfter: product.averageCost,
  });

  await file.save(JSON.stringify(history, null, 2));
}

/* =========================================================
    3. STOCK OPERATIONS (Company-Scoped)
========================================================= */

/**
 * STOCK IN: Adds stock and recalculates Average Cost (WAC) for THIS company.
 * Updated: Handles "Rollbacks" (Cancellations) without distorting WAC.
 */
async function stockIn(
  companyId,
  sku,
  { quantity, costPerUnit, note = "", date = null }
) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  quantity = Number(quantity);
  costPerUnit = Number(costPerUnit);

  if (!quantity || quantity <= 0)
    throw new AppError(400, "Quantity must be greater than zero");

  // Rule: For standard "Stock In", cost is required.
  // For "Rollbacks", allow fallback to current average cost.
  if (costPerUnit == null || costPerUnit < 0) {
    if (!note.toLowerCase().includes("rollback")) {
      throw new AppError(
        400,
        "Cost per unit is required and cannot be negative"
      );
    }
  }

  const product = await getProductBySku(companyId, sku);

  const currentQty = product.stockOnHand || 0;
  const currentAvgCost = product.averageCost || 0;

  const newTotalQty = currentQty + quantity;

  let newAverageCost;

  // Rollback logic: DO NOT change average cost
  if (
    note.toLowerCase().includes("rollback") ||
    note.toLowerCase().includes("cancel")
  ) {
    newAverageCost = currentAvgCost;
  } else {
    newAverageCost = parseFloat(
      (
        (currentQty * currentAvgCost + quantity * costPerUnit) /
        newTotalQty
      ).toFixed(2)
    );
  }

  // ✅ Inventory value is ALWAYS stock × averageCost
  const newInventoryValue = parseFloat(
    (newTotalQty * newAverageCost).toFixed(2)
  );

  const updatedProduct = await updateProduct(companyId, sku, {
    stockOnHand: newTotalQty,
    averageCost: newAverageCost,
    inventoryValue: newInventoryValue,
  });

  await recordMovement(
    companyId,
    updatedProduct,
    {
      type: "Stock In",
      quantity,
      costPerUnit: costPerUnit || currentAvgCost,
      note,
      date,
    }
  );

  return updatedProduct;
}

/**
 * STOCK OUT: Deducts stock based on current Weighted Average Cost.
 */
async function stockOut(companyId, sku, { quantity, note = "", date = null }) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  quantity = Number(quantity);
  if (!quantity || quantity <= 0)
    throw new AppError(400, "Quantity must be greater than zero");

  const product = await getProductBySku(companyId, sku);
  if (product.stockOnHand < quantity)
    throw new AppError(
      400,
      `Stock out failed: Only ${product.stockOnHand} units available`
    );

  const newQty = product.stockOnHand - quantity;

  const newInventoryValue = parseFloat(
    (newQty * (product.averageCost || 0)).toFixed(2)
  );

  const updatedProduct = await updateProduct(companyId, sku, {
    stockOnHand: newQty,
    inventoryValue: newInventoryValue,
  });

  await recordMovement(
    companyId,
    updatedProduct,
    { type: "Stock Out", quantity, note, date }
  );

  return updatedProduct;
}

/**
 * STOCK ADJUSTMENT: Manual correction of stock levels.
 */
async function stockAdjustment(
  companyId,
  sku,
  { quantity, note = "", date = null }
) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  quantity = Number(quantity);
  if (quantity == null || quantity === 0)
    throw new AppError(400, "Adjustment quantity must be non-zero");

  const product = await getProductBySku(companyId, sku);
  const newQty = product.stockOnHand + quantity;

  if (newQty < 0)
    throw new AppError(400, "Adjustment would make stock negative");

  const newInventoryValue = parseFloat(
    (newQty * (product.averageCost || 0)).toFixed(2)
  );

  const updatedProduct = await updateProduct(companyId, sku, {
    stockOnHand: newQty,
    inventoryValue: newInventoryValue,
  });

  await recordMovement(
    companyId,
    updatedProduct,
    { type: "Stock Adjustment", quantity, note, date }
  );

  return updatedProduct;
}

/* =========================================================
    4. REPORTING
========================================================= */

/**
 * GET ALL MOVEMENTS: Aggregates history for the entire company.
 */
async function getAllMovements(companyId) {
  if (!companyId) throw new AppError(400, "Company ID is required");

  try {
    const [files] = await bucket.getFiles({
      prefix: `companies/${companyId}/movements/`,
    });

    let allMovements = [];

    for (const file of files) {
      try {
        const [contents] = await file.download();
        const movements = JSON.parse(contents.toString());
        allMovements = allMovements.concat(movements);
      } catch (err) {
        console.error(
          `Failed to read movement file ${file.name}:`,
          err.message
        );
      }
    }

    return allMovements.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  } catch (err) {
    console.error("Error fetching all movements:", err.message);
    return [];
  }
}

module.exports = {
  stockIn,
  stockOut,
  stockAdjustment,
  getAllMovements,
};
