const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  let token;

  // 1. Check for System API Key first (Inter-service communication)
  const systemApiKey = req.headers['x-api-key'];
  if (systemApiKey && systemApiKey === process.env.SYSTEM_API_KEY) {
      req.user = {
          id: 'system',
          email: 'system@nbu.edu.ng',
          userType: 'system',
          permissions: ['finance:manage', 'finance:view'], // Grant necessary permissions for system
          roles: ['SYSTEM']
      };
      return next();
  }

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Standardize user object structure across services
    req.user = {
        id: decoded.userId,
        email: decoded.email,
        userType: decoded.userType,
        permissions: decoded.permissions || [],
        roles: decoded.roles || []
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

module.exports = authMiddleware;
