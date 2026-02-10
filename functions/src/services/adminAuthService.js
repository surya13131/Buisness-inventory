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

  // Check credentials
  if (
    email.toLowerCase() !== adminEmail.toLowerCase() ||
    password !== adminPassword
  ) {
    throw new Error("Invalid admin credentials");
  }

  // Check status
  if (adminStatus !== "ACTIVE") {
    throw new Error("Admin inactive");
  }

  // Return only the admin profile data
  return {
    email: adminEmail,
    role: "ADMIN",
    status: adminStatus
  };
}

module.exports = {
  verifyAdmin
};