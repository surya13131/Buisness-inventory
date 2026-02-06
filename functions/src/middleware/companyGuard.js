const companyService = require("../services/companyService");
const { AppError } = require("../controllers/productController");

async function companyGuard(req, res, next) {

  const companyId =
    req.user?.companyId ||
    req.headers["x-company-id"] ||
    req.companyId;

  if (!companyId) {

    // 🔴 FIX: handle error directly if next(err) is not supported
    if (typeof next !== "function") {
      return res.status(400).json({ message: "Missing company identification" });
    }

    return next(new AppError(400, "Missing company identification"));
  }

  try {
    const company = await companyService.getCompanyById(companyId);

    if (!company) {
      // 🔴 FIX
      if (typeof next !== "function") {
        return res.status(404).json({ message: "Company not found" });
      }

      return next(new AppError(404, "Company not found"));
    }

    if (company.status !== "ACTIVE") {
      // 🔴 FIX
      if (typeof next !== "function") {
        return res.status(403).json({ message: "Company account is suspended" });
      }

      return next(new AppError(403, "Company account is suspended"));
    }

    req.companyId = companyId;

    return next();
  } catch (err) {

    // 🔴 FIX
    if (typeof next !== "function") {
      return res.status(500).json({ message: "Company security error" });
    }

    return next(
      err instanceof AppError
        ? err
        : new AppError(500, "Company security error")
    );
  }
}

module.exports = { companyGuard };
