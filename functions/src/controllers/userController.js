const jwt = require("jsonwebtoken");
const companyService = require("../services/companyService");
// ✅ FIX: Import the function instead of the variable
const { getBucket } = require("../config/firebase");

async function userLogin(data) {
  const { email, password, companyId } = data || {};

  if (!email || !password || !companyId) {
    throw new Error("Email, password and companyId required");
  }

  // ✅ FIX: Initialize bucket inside the function
  const bucket = getBucket();
  const safeEmail = email.toLowerCase();
  
  // Note: Your folder name 'Zhian' is case-sensitive! 
  // Ensure the companyId matches the Storage folder exactly.
  const filePath = `companies/${companyId}/users/${safeEmail}.json`;
  const file = bucket.file(filePath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error("Invalid credentials");
  }

  const [buf] = await file.download();
  const user = JSON.parse(buf.toString());

  if (user.password !== password || user.companyId !== companyId) {
    throw new Error("Invalid credentials");
  }

  if (user.status !== "ENABLED") {
    throw new Error("Account disabled");
  }

  const company = await companyService.getCompanyById(companyId);
  if (!company) {
    throw new Error("Company not found");
  }

  if (company.status !== "ACTIVE") {
    throw new Error("Company suspended");
  }

  const token = jwt.sign(
    {
      email: safeEmail,
      companyId,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  return {
    message: "Login successful",
    token,
    role: user.role,
    companyId,
    expiresIn: "8h"
  };
}

async function getCompanyUsers(companyId, requester) {
  if (!requester || requester.role !== "OWNER") {
    throw new Error("Access denied");
  }

  // ✅ FIX: Initialize bucket here too
  const bucket = getBucket();
  const prefix = `companies/${companyId}/users/`;
  const [files] = await bucket.getFiles({ prefix });

  const users = [];

  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;

    try {
      const [buf] = await file.download();
      const user = JSON.parse(buf.toString());

      users.push({
        email: user.email,
        role: user.role,
        status: user.status,
        password: user.password 
      });
    } catch (e) {
      console.warn(`Skipping user file ${file.name}: ${e.message}`);
    }
  }

  return users;
}

module.exports = {
  userLogin,
  getCompanyUsers
};