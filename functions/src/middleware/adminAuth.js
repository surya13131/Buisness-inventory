async function verifyAdmin(email, password) {
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

  return {
    email: adminEmail,
    role: "ADMIN",
    status: adminStatus
  };
}
