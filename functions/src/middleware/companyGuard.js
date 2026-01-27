const companyService = require("../services/companyService");


async function companyGuard(req, res, next) {
  const companyId = req.headers["x-company-id"];

  if (!companyId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing companyId" }));
  }

  try {
    const company = await companyService.getCompanyById(companyId);

    if (!company) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Company not found" }));
    }

    if (company.status !== "ACTIVE") {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Company account is suspended" })
      );
    }
  
    req.companyId = companyId;

    return next();
  } catch (err) {
    console.error("Company Guard Error:", err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Company security error" }));
  }
}

module.exports = { companyGuard };
