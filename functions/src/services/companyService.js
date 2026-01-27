const { bucket } = require("../config/firebase");

/**
 * Helper to point to the correct master record in Firebase.
 * Path: companies-master/{companyId}.json
 */
const getCompanyFile = (companyId) =>
  bucket.file(`companies-master/${companyId}.json`);

/* =========================================================
    1. READ OPERATIONS (The Source of Truth)
========================================================= */

/**
 * Fetch a single company by its ID.
 * Used by: Admin Controller, Login Service, and Security Middleware.
 */
async function getCompanyById(companyId) {
  if (!companyId) return null;
  try {
    const [data] = await getCompanyFile(companyId).download();
    return JSON.parse(data.toString());
  } catch {
    // Returns null if the file doesn't exist (prevents server crash)
    return null;
  }
}

// Aliased for legacy support if needed
async function getCompany(companyId) {
  return await getCompanyById(companyId);
}

/**
 * List all companies registered on the platform.
 * Requirement: Admin-only View company list.
 */
async function getAllCompanies() {
  const [files] = await bucket.getFiles({ prefix: "companies-master/" });
  const list = [];

  for (const file of files) {
    try {
      const [data] = await file.download();
      list.push(JSON.parse(data.toString()));
    } catch (err) {
      console.error(`Failed to read company file: ${file.name}`);
    }
  }
  
  // Sort by name for the Admin UI
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/* =========================================================
    2. WRITE OPERATIONS (Admin Controlled)
========================================================= */

/**
 * Registers a new business entity.
 * Rule: Default status is ACTIVE.
 */
async function createCompany({ companyId, name }) {
  if (!companyId || !name) throw new Error("Company ID and Name are required");

  // Check if company ID already exists to prevent overwrite
  const existing = await getCompanyById(companyId);
  if (existing) throw new Error("A company with this ID already exists.");

  const company = {
    companyId,
    name,
    status: "ACTIVE", // Requirement: Active company must work normally
    createdAt: new Date().toISOString(),
  };

  await getCompanyFile(companyId).save(JSON.stringify(company));
  return company;
}

/**
 * Admin-only: Flip status between ACTIVE and SUSPENDED.
 * Requirement: Suspended company must not be able to log in.
 */
async function updateCompanyStatus(companyId, status) {
  const company = await getCompanyById(companyId);
  if (!company) throw new Error("Company not found");

  // Normalize status to uppercase
  const newStatus = status.toUpperCase(); 
  if (!["ACTIVE", "SUSPENDED"].includes(newStatus)) {
    throw new Error("Invalid status. Must be ACTIVE or SUSPENDED.");
  }

  company.status = newStatus;
  company.updatedAt = new Date().toISOString();

  await getCompanyFile(companyId).save(JSON.stringify(company));
  
  return {
    message: `Company ${companyId} status updated to ${newStatus}`,
    company
  };
}

module.exports = {
  getCompanyById, 
  getCompany,
  createCompany,
  updateCompanyStatus,
  getAllCompanies,
};