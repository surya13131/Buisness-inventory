const { getBucket } = require("../config/firebase");

// Initialize bucket instance
const bucket = getBucket();

const VALID_STATUSES = ["ENABLED", "DISABLED"];

async function getUserByEmail(email, companyId) {
  if (!email || !companyId) return null;

  const safeEmail = email.toLowerCase();
  
  const filePath = `companies/${companyId}/users/${safeEmail}.json`;
  const file = bucket.file(filePath);
  const [exists] = await file.exists();
  if (!exists) return null;

  const [buf] = await file.download();
  return JSON.parse(buf.toString());
}


async function updateUserStatus(email, status, companyId) {
  if (!email || !companyId) {
    throw new Error("Email and Company ID are required");
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Invalid user status. Use ENABLED or DISABLED");
  }

  const safeEmail = email.toLowerCase();
  

  const user = await getUserByEmail(safeEmail, companyId);

  if (!user) {
    throw new Error(`User ${safeEmail} not found in company ${companyId}`);
  }
  
  user.status = status;
  user.updatedAt = new Date().toISOString();

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