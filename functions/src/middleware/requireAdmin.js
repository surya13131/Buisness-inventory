function requireAdmin(req, res, next) {
  const adminHeader = req.headers["x-admin"];

  if (adminHeader !== "true") {
    return res.status(403).json({
      message: "Access denied: Admin only"
    });
  }

  // Optional context
  req.isAdmin = true;
  req.userRole = "ADMIN";

  return next();
}

module.exports = { requireAdmin };
