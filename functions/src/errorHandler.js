function handleError(err, res) {
  const timestamp = new Date().toISOString();

  // ===================== 🔴 CORS SUPPORT START =====================
  // This block ensures errors aren't blocked by the browser policy
  const allowedOrigins = [
    "https://bussiness-control-platform.web.app",
    "https://bussiness-control-platform.firebaseapp.com",
    "http://localhost:5000",
    "http://localhost:5500"
  ];

  const origin = res.req?.headers?.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*"); 
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-company-id, x-user-email, x-admin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  // ===================== 🔴 CORS SUPPORT END =======================

  // Extract request info safely for logging
  const req = res.req || {};
  const method = req.method || "N/A";
  const path = req.url || "N/A";

  // 1. Console Log for Developer Debugging
  console.error(`
========== ❌ INVENTORY SYSTEM ERROR ==========
Timestamp: ${timestamp}
Action:    ${method} ${path}
Message:   ${err.message || "No message provided"}
Status:    ${err.statusCode || 500}
Code:      ${err.code || "N/A"}
================================================
  `);

  // 2. Safety Gate: If headers were already sent, just close the connection
  if (res.headersSent) {
    console.warn("⚠️ Headers already sent. Cannot send JSON error payload.");
    try { res.end(); } catch (e) {}
    return;
  }

  let status = 500;
  let businessReason = "An internal system error occurred. Please try again.";
  let uiTitle = "System Error";

  const errorMapping = {
    "storage/object-not-found": {
      status: 404,
      title: "Not Found",
      reason: "The requested resource does not exist."
    },
    "already-exists": {
      status: 409,
      title: "Duplicate Entry",
      reason: "A record with this information already exists."
    },
    "permission-denied": {
      status: 403,
      title: "Access Denied",
      reason: "You do not have permission to perform this action."
    },
    "invalid-argument": {
      status: 400,
      title: "Validation Error",
      reason: "The data provided is incorrectly formatted."
    }
  };

  // A. Check for AppError (errors thrown manually with statusCode)
  if (err.statusCode) {
    status = err.statusCode;
    uiTitle = status === 400 ? "Validation Failed" : "Request Error";
    businessReason = err.message;
  } 
  // B. Check for System/Firebase error codes
  else if (err.code && errorMapping[err.code]) {
    status = errorMapping[err.code].status;
    uiTitle = errorMapping[err.code].title;
    businessReason = errorMapping[err.code].reason;
  }
  // C. Fallback for generic JavaScript errors
  else if (err.message) {
    businessReason = err.message;
  }

  const payload = JSON.stringify({
    success: false,
    message: businessReason, 
    error: {
      title: uiTitle,
      technical_details: err.message || "N/A",
      path: path,
      timestamp: timestamp
    }
  });

  // 3. Send Response with correct JSON headers
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");

  // 🔒 SAFETY WRAP (Cloud Run compatible)
  try {
    res.setHeader("Content-Length", Buffer.byteLength(payload));
  } catch (lengthError) {
    console.warn("⚠️ Failed to set Content-Length safely:", lengthError.message);
  }
  
  // Final exit
  res.end(payload);
}

module.exports = handleError;