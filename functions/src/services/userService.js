const { bucket } = require("../config/firebase");

const VALID_STATUSES = ["ENABLED", "DISABLED"];

/**
 * Finds a user within a specific company folder
 */
async function getUserByEmail(email, companyId) {
  if (!email || !companyId) return null;

  const safeEmail = email.toLowerCase();
  // Updated Path: Look inside the specific company's user folder
  const filePath = `companies/${companyId}/users/${safeEmail}.json`;
  const file = bucket.file(filePath);
  
  const [exists] = await file.exists();
  if (!exists) return null;

  const [buf] = await file.download();
  return JSON.parse(buf.toString());
}

/**
 * Toggles status (ENABLED/DISABLED) for a user in a specific company
 */
async function updateUserStatus(email, status, companyId) {
  if (!email || !companyId) {
    throw new Error("Email and Company ID are required");
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Invalid user status. Use ENABLED or DISABLED");
  }

  const safeEmail = email.toLowerCase();
  
  // 1. Fetch existing user data from the correct company path
  const user = await getUserByEmail(safeEmail, companyId);

  if (!user) {
    throw new Error(`User ${safeEmail} not found in company ${companyId}`);
  }

  // 2. Update fields
  user.status = status;
  user.updatedAt = new Date().toISOString();

  // 3. Save back to the nested path
  const filePath = `companies/${companyId}/users/${safeEmail}.json`;
  await bucket
    .file(filePath)
    .save(JSON.stringify(user, null, 2), {
      contentType: "application/json"
    });

  return {
    email: safeEmail,
    companyId: companyId,
    status: user.status,
    updatedAt: user.updatedAt
  };
}

module.exports = {
  getUserByEmail,
  updateUserStatus,
};