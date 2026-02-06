const jwt = require("jsonwebtoken");

async function verifyAdmin(email, password) {
  if (!email || !password) {
    throw new Error("Email and password required");
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminStatus = process.env.ADMIN_STATUS || "ACTIVE";
  if (!adminEmail || !adminPassword) {
    throw new Error("Admin system not configured");
  }

if (
    email.toLowerCase() !== adminEmail.toLowerCase() ||
    password !== adminPassword
  ) {
    throw new Error("Invalid admin credentials");
  }

  if (adminStatus !== "ACTIVE") {
    throw new Error("Admin inactive");
  }
  
  const token = jwt.sign(
    {
      email: adminEmail,
      role: "ADMIN"
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "8h"
    }
  );

  return {
    email: adminEmail,
    role: "ADMIN",
    status: adminStatus,
    token,
    expiresIn: 8 * 60 * 60 // 28800 seconds
  };
}

module.exports = {
  verifyAdmin
};
