const companyService = require("../services/companyService");
const adminAuth = require("../services/adminAuthService");
const { bucket } = require("../config/firebase");


async function adminLogin(data) {
  const { email, password } = data || {};
  if (!email || !password) throw new Error("Email and password required");

  const admin = await adminAuth.verifyAdmin(email, password);
  if (!admin) throw new Error("Invalid admin credentials");

  if (!["ACTIVE", "ENABLED"].includes(admin.status)) {
    throw new Error("Admin inactive");
  }

  return {
    message: "Admin login successful",
    role: "ADMIN",
    email: admin.email
  };
}


async function createCompany(req) {
  const { companyId, name } = req.body || {};

  if (!companyId || !name) {
    throw new Error("Company ID and name required");
  }

  await companyService.createCompany({
    companyId,
    name,
    status: "ACTIVE",
    createdAt: new Date().toISOString()
  });

  const infoFile = bucket.file(`companies/${companyId}/info.json`);
  await infoFile.save(JSON.stringify({ companyId, name, created: true }), {
    contentType: "application/json"
  });

  return {
    message: "Company created successfully",
    companyId,
    companyName: name,
    status: "ACTIVE"
  };
}

async function listCompanies() {
  return companyService.getAllCompanies();
}

async function suspendCompany(companyId) {
  if (!companyId) throw new Error("Company ID required");
  return companyService.updateCompanyStatus(companyId, "SUSPENDED");
}

async function activateCompany(companyId) {
  if (!companyId) throw new Error("Company ID required");
  return companyService.updateCompanyStatus(companyId, "ACTIVE");
}


async function createOwnerUser(req) {
  const { email, password, companyId } = req.body || {};

  if (!email || !password || !companyId) {
    throw new Error("Email, password and companyId required");
  }

  const company = await companyService.getCompanyById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new Error("Company not active or found");
  }

  const safeEmail = email.toLowerCase();
  const filePath = `companies/${companyId}/users/${safeEmail}.json`;
  const file = bucket.file(filePath);

  const [exists] = await file.exists();
  if (exists) {
    throw new Error("User already exists in this company");
  }

  const userData = {
    email: safeEmail,
    password,
    role: "OWNER",
    companyId,
    status: "ENABLED",
    createdAt: new Date().toISOString()
  };

  await file.save(JSON.stringify(userData, null, 2), {
    contentType: "application/json"
  });

  return {
    message: "Owner user created successfully",
    email: safeEmail,
    companyId,
    storagePath: filePath
  };
}

/* =========================================================
   4. USER STATUS MANAGEMENT (ENABLE / DISABLE)
========================================================= */
async function updateUserStatus(email, status, companyId) {
  if (!email || !companyId || !["ENABLED", "DISABLED"].includes(status)) {
    throw new Error("Email, Company ID, and valid status required");
  }

  const safeEmail = email.toLowerCase();
  const filePath = `companies/${companyId}/users/${safeEmail}.json`;
  const file = bucket.file(filePath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error("User not found in this company");
  }

  const [buf] = await file.download();
  const user = JSON.parse(buf.toString());

  user.status = status;
  user.updatedAt = new Date().toISOString();

  await file.save(JSON.stringify(user, null, 2), {
    contentType: "application/json"
  });

  return {
    message: `User ${status === "ENABLED" ? "activated" : "suspended"} successfully`,
    email: safeEmail,
    status: user.status
  };
}

module.exports = {
  adminLogin,
  createCompany,
  listCompanies,
  suspendCompany,
  activateCompany,
  createOwnerUser,
  updateUserStatus
};
