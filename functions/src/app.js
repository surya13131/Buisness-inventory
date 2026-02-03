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

const errorHandler = require("./errorHandler");

/* =========================================================
   CORS CONFIGURATION
========================================================= */
const corsHandler = cors({
  origin: "https://bussiness-control-platform.web.app",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "x-admin",
    "x-user-email",
    "x-company-id",
    "Authorization"
  ]
});

/* =========================================================
   API HANDLER
========================================================= */
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
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const segments = path.split("/").filter(Boolean);
      const method = req.method;

      console.log(`[${method}] ${path}`);

      /* =====================================================
          ADMIN LOGIN (PUBLIC)
      ===================================================== */
      if (path === "/admin/login" && method === "POST") {
        return res.status(200).json(
          await adminController.adminLogin(req.body)
        );
      }

      /* =====================================================
          ADMIN ROUTES (PROTECTED)
      ===================================================== */
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

      /* =====================================================
          USER LOGIN (OWNER / EMPLOYEE)
      ===================================================== */
      if (path === "/login" && method === "POST") {
        return res.status(200).json(
          await userController.userLogin(req.body)
        );
      }

      /* =====================================================
          TENANT ROUTES (AUTH + COMPANY GUARD)
      ===================================================== */
      return requireAuth(req, res, () =>
        companyGuard(req, res, async () => {

          /* ---------- COMPANY USERS (OWNER ONLY) ---------- */
          if (path === "/company-users" && method === "GET") {
            return res.json(
              await userController.getCompanyUsers(req.companyId, req.user)
            );
          }

          /* ---------- DASHBOARD SUMMARY ---------- */
          if (path === "/dashboard-summary" && method === "GET") {
            return res.json(
              await invoiceController.getDashboardSummary(req.companyId)
            );
          }

          /* ---------- PRODUCTS ---------- */
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


          /* ---------- INVOICES ---------- */
          // Specific Resource Routes first (Cancel & Payment)
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

    // Collection Routes
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


          /* ---------- REPORTS ---------- */
          if (path === "/reports/export" && method === "GET") {
            return res.json(
              await reportController.getExportData(req.companyId)
            );
          }

          /* ---------- INVENTORY ---------- */
          if (path === "/movements" && method === "GET") {
            return res.json(
              await inventoryController.getAllMovements(req.companyId)
            );
          }

          if (method === "POST" && segments.length === 2) {
            const [operation, sku] = segments;

            if (operation === "stock-in") {
              return res.json(
                await inventoryController.stockIn(
                  req.companyId,
                  sku,
                  req.body
                )
              );
            }

            if (operation === "stock-out") {
              return res.json(
                await inventoryController.stockOut(
                  req.companyId,
                  sku,
                  req.body
                )
              );
            }

            if (operation === "stock-adjustment") {
              return res.json(
                await inventoryController.stockAdjustment(
                  req.companyId,
                  sku,
                  req.body
                )
              );
            }
          }

          return res.status(404).json({ message: "Route not found" });
        })
      );

    } catch (err) {
      console.error("API ERROR 🛑");
      console.error(err.stack);
      // Ensure we use the custom errorHandler to return JSON instead of plain text
      return errorHandler(err, res);
    }
  });
};

module.exports = { apiHandler };