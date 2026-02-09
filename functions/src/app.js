const cors = require("cors");

const productController = require("./controllers/productController");
const inventoryController = require("./controllers/inventoryController");
const customerController = require("./controllers/customerController");
const invoiceController = require("./controllers/invoiceController");
const adminController = require("./controllers/adminController");
const userController = require("./controllers/userController");
const reportController = require("./controllers/reportController"); 

const { requireAdmin } = require("./middleware/requireAdmin");
const { requireAuth } = require("./middleware/requireAuth");
const { companyGuard } = require("./middleware/companyGuard");
const aiController = require("./controllers/aiController");

const errorHandler = require("./errorHandler");

const allowedOrigins = [
  "https://bussiness-control-platform.web.app",
  "https://bussiness-control-platform.firebaseapp.com",
  "http://localhost:5000",
  "http://localhost:5500"
];

const corsHandler = cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Blocked by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "x-admin",
    "x-user-email",
    "x-company-id",
    "Authorization"
  ]
});

const getRequestBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
};

const apiHandler = (req, res) => {
  res.setHeader("Vary", "Origin");
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*"); 
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-company-id, x-user-email, x-admin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }

  return corsHandler(req, res, async () => {
    try {
      if (allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }

      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        req.body = await getRequestBody(req);
      } else {
        req.body = {};
      }

      const path = (req.url.split('?')[0]).replace(/\/+$/, "") || "/";
      const segments = path.split("/").filter(Boolean);
      const method = req.method;

      console.log(`[${method}] ${path}`);

      if ((path === "/health" || path === "/api/health") && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
      }

      if ((path === "/ai/analyze" || path === "/api/ai/analyze") && method === "POST") {
        return requireAuth(req, res, () =>
          companyGuard(req, res, () =>
            aiController.handleAiQuery(req, res)
          )
        );
      }

      if (path === "/admin/login" && method === "POST") {
        return res.status(200).json(
          await adminController.adminLogin(req.body)
        );
      }

      if (segments[0] === "admin" && segments[1] !== "login") {
        return requireAdmin(req, res, async () => {
          if (segments[1] === "companies" && segments.length === 2) {
            if (method === "POST") {
              return res.status(201).json(await adminController.createCompany(req));
            }
            if (method === "GET") {
              return res.json(await adminController.listCompanies());
            }
          }

          if (segments[1] === "companies" && segments.length === 4 && method === "POST") {
            const companyId = segments[2];
            if (segments[3] === "activate") return res.json(await adminController.activateCompany(companyId));
            if (segments[3] === "suspend") return res.json(await adminController.suspendCompany(companyId));
          }

          if (segments[1] === "users" && segments.length === 2) {
            if (method === "POST") return res.status(201).json(await adminController.createOwnerUser(req));
          }

          if (segments[1] === "users" && segments.length === 4 && method === "PATCH" && segments[3] === "status") {
            const email = segments[2];
            const { status, companyId } = req.body;
            return res.json(await adminController.updateUserStatus(email, status, companyId));
          }

          return res.status(404).json({ message: "Admin route not found" });
        });
      }

      if (path === "/login" && method === "POST") {
        return res.status(200).json(await userController.userLogin(req.body));
      }

      return requireAuth(req, res, () =>
        companyGuard(req, res, async () => {

          if (path === "/company-users" && method === "GET") {
            return res.json(await userController.getCompanyUsers(req.companyId, req.user));
          }

          if (path === "/dashboard-summary" && method === "GET") {
            return res.json(await invoiceController.getDashboardSummary(req.companyId));
          }

          if (path === "/products") {
            if (method === "GET") return res.json(await productController.getAllProducts(req.companyId));
            if (method === "POST") {
              try {
                return res.status(201).json(await productController.createProduct(req.companyId, req.body));
              } catch (err) { return errorHandler(err, res); }
            }
          }

          if (segments[0] === "products" && segments.length === 2) {
            const sku = segments[1];
            if (method === "GET") return res.json(await productController.getProductBySku(req.companyId, sku));
            if (method === "DELETE") return res.json(await productController.deleteProduct(req.companyId, sku));
          }

          /* ---------- CUSTOMERS (GST OPTIONAL LOGIC IN CONTROLLER) ---------- */
          if (path === "/customers") {
            if (method === "GET") return res.json(await customerController.getAllCustomers(req.companyId));
            if (method === "POST") {
              try {
                // Controller handles optional GST validation
                return res.status(201).json(await customerController.createCustomer(req.companyId, req.body));
              } catch (err) { return errorHandler(err, res); }
            }
          }

          // ✅ NEW: CUSTOMER EDIT & DELETE ROUTES
          if (segments[0] === "customers" && segments.length === 2) {
            const customerId = segments[1];
            
            if (method === "PUT") {
              try {
                return res.json(await customerController.updateCustomer(req.companyId, customerId, req.body));
              } catch (err) { return errorHandler(err, res); }
            }

            if (method === "DELETE") {
              try {
                return res.json(await customerController.deleteCustomer(req.companyId, customerId));
              } catch (err) { return errorHandler(err, res); }
            }
          }

          const invIdx = segments.indexOf("invoices");
          if (invIdx !== -1 && segments.length >= invIdx + 3) {
            const invoiceNumber = segments[invIdx + 1];
            const action = segments[invIdx + 2];

            if (action === "cancel" && method === "POST") {
              try {
                return res.status(200).json(await invoiceController.cancelInvoice(req.companyId, invoiceNumber));
              } catch (err) { return errorHandler(err, res); }
            }

            if (action === "payments" && method === "POST") {
              try {
                return res.status(201).json(await invoiceController.recordPayment(req.companyId, invoiceNumber, req.body));
              } catch (err) { return errorHandler(err, res); }
            }
          }

          if (path === "/invoices") {
            if (method === "GET") return res.json(await invoiceController.getAllInvoices(req.companyId));
            if (method === "POST") {
              try {
                return res.status(201).json(await invoiceController.createInvoice(req.companyId, req.body));
              } catch (err) { return errorHandler(err, res); }
            }
          }

          if (path === "/reports/export" && method === "GET") {
            return res.json(await reportController.getExportData(req.companyId));
          }

          if (path === "/movements" && method === "GET") {
            return res.json(await inventoryController.getAllMovements(req.companyId));
          }

          if (method === "POST" && segments.length === 2) {
            const [operation, sku] = segments;
            if (operation === "stock-in") return res.json(await inventoryController.stockIn(req.companyId, sku, req.body));
            if (operation === "stock-out") return res.json(await inventoryController.stockOut(req.companyId, sku, req.body));
            if (operation === "stock-adjustment") return res.json(await inventoryController.stockAdjustment(req.companyId, sku, req.body));
          }

          return res.status(404).json({ message: "Route not found" });
        })
      );

    } catch (err) {
      console.error("API ERROR 🛑");
      console.error(err.stack);
      return errorHandler(err, res);
    }
  });
};

module.exports = { apiHandler };