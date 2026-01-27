function handleError(err, res) {
  const timestamp = new Date().toISOString();

  // ✅ Plain Node-safe request info
  const req = res.req || {};
  const method = req.method || "N/A";
  const path = req.url || "N/A";

  console.error(`
========== ❌ INVENTORY SYSTEM ERROR ==========
Timestamp: ${timestamp}
Action:    ${method} ${path}
Error Type: ${err.name || "SystemError"}
Message:    ${err.message}
Code:       ${err.code || "N/A"}
================================================
  `);

  // ✅ If headers already sent, fail safely
  if (res.headersSent) {
    try { res.end(); } catch {}
    return;
  }

  /* =========================
     DEFAULT RESPONSE VALUES
  ========================= */
  let status = 500;
  let businessReason =
    "An internal system error occurred. Please try again later.";
  let uiMessage = "System Failure";

  /* =========================
     ERROR CODE MAPPING
  ========================= */
  const errorMapping = {
    "storage/object-not-found": {
      status: 404,
      msg: "Product Not Found",
      why: "The requested resource does not exist."
    },
    "already-exists": {
      status: 409,
      msg: "Duplicate Entry",
      why: "A resource with this identifier already exists."
    },
    "permission-denied": {
      status: 403,
      msg: "Access Denied",
      why: "The system does not have permission to perform this action."
    },
    "invalid-argument": {
      status: 400,
      msg: "Invalid Data",
      why: "The data provided is not in the expected format."
    }
  };

  /* =========================
     BUSINESS / APP ERRORS
  ========================= */
  if (err.statusCode) {
    status = err.statusCode;
    uiMessage = "Validation Error";
    businessReason = err.message;
  }
  /* =========================
     SYSTEM / FIREBASE ERRORS
  ========================= */
  else if (err.code && errorMapping[err.code]) {
    status = errorMapping[err.code].status;
    uiMessage = errorMapping[err.code].msg;
    businessReason = errorMapping[err.code].why;
  }

  /* =========================
     FINAL RESPONSE (PLAIN NODE)
  ========================= */
  const payload = JSON.stringify({
    success: false,
    error: {
      title: uiMessage,
      message: businessReason,
      technical_details: err.message,
      path,
      timestamp
    }
  });

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

module.exports = handleError;
