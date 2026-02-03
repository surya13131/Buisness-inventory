const companyService = require("../services/companyService");
const { AppError } = require("../controllers/productController");

async function companyGuard(req, res, next) {
  // 1. Try to get companyId from the decoded token (req.user) OR headers
  // This ensures that even if the header is missing, the authenticated user's ID is used.
  const companyId =
    req.user?.companyId ||
    req.headers["x-company-id"] ||
    req.companyId;

  if (!companyId) {
    // ❗ Do NOT end response here — throw instead
    return next(new AppError(400, "Missing company identification"));
  }

  try {
    const company = await companyService.getCompanyById(companyId);

    if (!company) {
      return next(new AppError(404, "Company not found"));
    }

    // Check if the company is suspended
    if (company.status !== "ACTIVE") {
      return next(new AppError(403, "Company account is suspended"));
    }

    // Attach to request for use in controllers
    req.companyId = companyId;

    return next();
  } catch (err) {
    console.error("Company Guard Error:", err.message);

    // ❗ Pass error to central handler
    return next(
      err instanceof AppError
        ? err
        : new AppError(500, "Company security error")
    );
  }
}

module.exports = { companyGuard };
