
const { getBucket } = require("../config/firebase");

const getCompanyFile = (companyId) => {
  const bucket = getBucket();
  return bucket.file(`companies-master/${companyId}.json`);
};

async function getCompanyById(companyId) {
  if (!companyId) return null;
  try {
    const [data] = await getCompanyFile(companyId).download();
    return JSON.parse(data.toString());
  } catch (error) {
    // Log the error to terminal so you know if it's a 404 or a permission issue
    console.error(`Error fetching company ${companyId}:`, error.message);
    return null;
  }
}

async function getCompany(companyId) {
  return await getCompanyById(companyId);
}

async function getAllCompanies() {
  // ✅ FIX: Get bucket instance here
  const bucket = getBucket();
  const [files] = await bucket.getFiles({ prefix: "companies-master/" });
  const list = [];

  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    try {
      const [data] = await file.download();
      list.push(JSON.parse(data.toString()));
    } catch (err) {
      console.error(`Failed to read company file: ${file.name}`);
    }
  }
  
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

async function createCompany({ companyId, name }) {
  if (!companyId || !name) throw new Error("Company ID and Name are required");

  const existing = await getCompanyById(companyId);
  if (existing) throw new Error("A company with this ID already exists.");

  const company = {
    companyId,
    name,
    status: "ACTIVE", 
    createdAt: new Date().toISOString(),
  };

  // Re-uses the getCompanyFile helper which now uses getBucket()
  await getCompanyFile(companyId).save(JSON.stringify(company));
  return company;
}

async function updateCompanyStatus(companyId, status) {
  const company = await getCompanyById(companyId);
  if (!company) throw new Error("Company not found");

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