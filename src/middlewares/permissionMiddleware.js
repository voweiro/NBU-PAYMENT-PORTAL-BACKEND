const authorizePermission = (requiredPermission) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Access Denied: User not authenticated' });
    }

    const userPermissions = user.permissions || [];

    // Allow SUPER_ADMIN access to EVERYTHING
    // roles is an array of strings (names) in the token
    const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');
    if (isSuperAdmin) {
      return next();
    }

    // Support array of permissions (OR logic)
    if (Array.isArray(requiredPermission)) {
        const hasPermission = requiredPermission.some(p => userPermissions.includes(p));
        if (hasPermission) {
            return next();
        }
        return res.status(403).json({ message: `Access Denied: Missing one of permissions '${requiredPermission.join(', ')}'` });
    }

    if (userPermissions.includes(requiredPermission)) {
      next();
    } else {
      res.status(403).json({ message: `Access Denied: Missing permission '${requiredPermission}'` });
    }
  };
};

module.exports = authorizePermission;
