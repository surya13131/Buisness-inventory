const functions = require("firebase-functions");
const admin = require("firebase-admin");


const {
  createProduct,
  getAllProducts,
  getProductBySku,
  updateProduct,
  deleteProduct,
} = require("./controllers/productController");

const {
  stockIn,
  stockOut,
  stockAdjustment,
  getAllMovements,
} = require("./controllers/inventoryController");

const handleError = require("./errorHandler");

if (!admin.apps.length) {
  admin.initializeApp();
}

const FRONTEND_URL = "https://bussiness-control-platform.web.app";


function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_URL);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}


async function parseJSONBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}
async function apiHandler(req, res) {
  try {
    setCorsHeaders(res);

   
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
const path = req.path.replace(/\/+$/, "") || "/";
    const method = req.method;
    console.log(`[API] ${method} ${path}`);
if (path === "/products") {
      if (method === "GET") {
        return res.json(await getAllProducts());
      }
if (method === "POST") {
        const data = await parseJSONBody(req);
 if (!data.sku || !data.name || data.costPrice === undefined) {
          return res.status(400).json({
            message: "SKU, Name, and Cost Price are required to create a product.",
          });
        }
const product = await createProduct(data);
        return res.status(201).json(product);
      }
    }

const productMatch = path.match(/^\/products\/(.+)$/);
if (productMatch) {
      const sku = decodeURIComponent(productMatch[1]);
if (method === "GET") {
        return res.json(await getProductBySku(sku));
      }
if (method === "PUT") {
        return res.json(
          await updateProduct(sku, await parseJSONBody(req))
        );
      }
if (method === "DELETE") {
        return res.json(await deleteProduct(sku));
      }
    }

   
    const stockMatch = path.match(
      /^\/(stock-in|stock-out|stock-adjustment)\/(.+)$/
    );

    if (stockMatch && method === "POST") {
      const [, type, skuEncoded] = stockMatch;
      const sku = decodeURIComponent(skuEncoded);
      const body = await parseJSONBody(req);

      let result;
      if (type === "stock-in") result = await stockIn(sku, body);
      if (type === "stock-out") result = await stockOut(sku, body);
      if (type === "stock-adjustment")
        result = await stockAdjustment(sku, body);

      return res.json(result);
    }
if (path === "/movements" && method === "GET") {
      return res.json(await getAllMovements());
    }
return res.status(404).json({
      message: "Route not found",
      path,
      method,
    });
} catch (err) {
    return handleError(err, res);
  }
}
exports.api = functions.https.onRequest(apiHandler);
