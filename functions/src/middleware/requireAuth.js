const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

  
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authorization token required"
      });
    }

    const token = authHeader.split(" ")[1];

    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);


    req.user = {
      email: decoded.email,
      role: decoded.role
    };

    req.companyId = decoded.companyId;

    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Session expired or invalid token"
    });
  }
}

module.exports = { requireAuth };
