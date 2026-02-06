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
    // allow server-to-server & tools
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

// ===================== 🔴 ADD THIS BLOCK =====================
// Manual JSON body parser (REQUIRED for Firebase Gen-2)
const getRequestBody = async (req) => {
  if (req.body && Object.keys(req.body).length > 0) return req.body;

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
// ===================== 🔴 ADD END =============================

const apiHandler = (req, res) => {
  // Lightweight Express-like helpers
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (data) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  /* PREFLIGHT */
  if (req.method === "OPTIONS") {
    return corsHandler(req, res, () => res.status(204).end());
  }

  return corsHandler(req, res, async () => {
    try {
      // ===================== 🔴 ADD THIS LINE =====================
      // ===================== ✅ SAFE BODY PARSING =====================
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        req.body = await getRequestBody(req);
      } else {
        req.body = {};
      }
      // ===================== ✅ SAFE BODY PARSING END =================
      // ===================== 🔴 ADD END ===========================

      // ✅ SAFE PATH PARSING: Replaces the unstable new URL() constructor 
      // which crashes during Google health checks when host is missing.
      const path = (req.url.split('?')[0]).replace(/\/+$/, "") || "/";
      const segments = path.split("/").filter(Boolean);
      const method = req.method;

      console.log(`[${method}] ${path}`);

      // ===================== 🔴 ADD THIS BLOCK =====================
      // Cloud Run / Firebase health check (Closes connection properly)
      if ((path === "/health" || path === "/api/health") && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
      }
      // ===================== 🔴 ADD END ===========================

      /* ---------- AI ANALYTICS (AUTH REQUIRED) ---------- */
      // This block is kept for global/pre-guard access if needed, 
      // but the primary handler is moved inside the auth flow below.
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

          /* ---------- COMPANIES ---------- */
          if (segments[1] === "companies" && segments.length === 2) {
            if (method === "POST") {
              return res.status(201).json(
                await adminController.createCompany(req)
              );
            }
            if (method === "GET") {
              return res.json(
                await adminController.listCompanies()
              );
            }
          }

          if (
            segments[1] === "companies" &&
            segments.length === 4 &&
            method === "POST"
          ) {
            const companyId = segments[2];

            if (segments[3] === "activate") {
              return res.json(
                await adminController.activateCompany(companyId)
              );
            }

            if (segments[3] === "suspend") {
              return res.json(
                await adminController.suspendCompany(companyId)
              );
            }
          }

          /* ---------- USERS ---------- */
          if (segments[1] === "users" && segments.length === 2) {
            if (method === "POST") {
              return res.status(201).json(
                await adminController.createOwnerUser(req)
              );
            }
          }

          if (
            segments[1] === "users" &&
            segments.length === 4 &&
            method === "PATCH" &&
            segments[3] === "status"
          ) {
            const email = segments[2];
            const { status, companyId } = req.body;

            return res.json(
              await adminController.updateUserStatus(email, status, companyId)
            );
          }

          return res.status(404).json({
            message: "Admin route not found"
          });
        });
      }

      if (path === "/login" && method === "POST") {
        return res.status(200).json(
          await userController.userLogin(req.body)
        );
      }

      return requireAuth(req, res, () =>
        companyGuard(req, res, async () => {

          /* ---------- AI ANALYTICS ---------- */
          if ((path === "/ai/analyze" || path === "/api/ai/analyze") && method === "POST") {
            return await aiController.handleAiQuery(req, res);
          }

          /* ---------- COMPANY USERS (OWNER ONLY) ---------- */
          if (path === "/company-users" && method === "GET") {
            return res.json(
              await userController.getCompanyUsers(req.companyId, req.user)
            );
          }

          if (path === "/dashboard-summary" && method === "GET") {
            return res.json(
              await invoiceController.getDashboardSummary(req.companyId)
            );
          }

          if (path === "/products") {
            if (method === "GET") {
              return res.json(
                await productController.getAllProducts(req.companyId)
              );
            }

            if (method === "POST") {
              try {
                const result = await productController.createProduct(
                  req.companyId,
                  req.body
                );
                return res.status(201).json(result);
              } catch (err) {
                return errorHandler(err, res);
              }
            }
          }

          if (segments[0] === "products" && segments.length === 2) {
            const sku = segments[1];

            if (method === "GET") {
              return res.json(
                await productController.getProductBySku(req.companyId, sku)
              );
            }
            if (method === "DELETE") {
              return res.json(
                await productController.deleteProduct(req.companyId, sku)
              );
            }
          }

          if (path === "/customers") {
            if (method === "GET") {
              return res.json(
                await customerController.getAllCustomers(req.companyId)
              );
            }

            if (method === "POST") {
              try {
                const result = await customerController.createCustomer(
                  req.companyId,
                  req.body
                );
                return res.status(201).json(result);
              } catch (err) {
                return errorHandler(err, res);
              }
            }
          }

          if (segments[0] === "invoices" && segments.length === 3) {
            const invoiceNumber = segments[1];
            const action = segments[2];

            if (action === "cancel" && method === "POST") {
              return res.status(200).json(
                await invoiceController.cancelInvoice(req.companyId, invoiceNumber)
              );
            }

            if (action === "payments" && method === "POST") {
              return res.status(201).json(
                await invoiceController.recordPayment(req.companyId, invoiceNumber, req.body)
              );
            }
          }

          if (path === "/invoices") {
            if (method === "GET") {
              return res.json(
                await invoiceController.getAllInvoices(req.companyId)
              );
            }

            if (method === "POST") {
              try {
                const result = await invoiceController.createInvoice(
                  req.companyId,
                  req.body
                );
                return res.status(201).json(result);
              } catch (err) {
                return errorHandler(err, res);
              }
            }
          }

          if (path === "/reports/export" && method === "GET") {
            return res.json(
              await reportController.getExportData(req.companyId)
            );
          }

          if (path === "/movements" && method === "GET") {
            return res.json(
              await inventoryController.getAllMovements(req.companyId)
            );
          }

          if (method === "POST" && segments.length === 2) {
            const [operation, sku] = segments;

            if (operation === "stock-in") {
              return res.json(
                await inventoryController.stockIn(req.companyId, sku, req.body)
              );
            }

            if (operation === "stock-out") {
              return res.json(
                await inventoryController.stockOut(req.companyId, sku, req.body)
              );
            }

            if (operation === "stock-adjustment") {
              return res.json(
                await inventoryController.stockAdjustment(req.companyId, sku, req.body)
              );
            }
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