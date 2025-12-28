const jwt = require('jsonwebtoken');

class JwtService {
  constructor() {
    this.secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.refreshExpiresIn = '7d';
  }

  generateToken(user) {
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.secret, { 
      expiresIn: this.expiresIn,
      algorithm: 'HS256'
    });
  }

  generateRefreshToken(user) {
    const payload = {
      id: user._id,
      email: user.email,
      type: 'refresh'
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.refreshExpiresIn,
      algorithm: 'HS256'
    });
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    } catch (error) {
      console.error('Token verification error:', error.message);
      return null;
    }
  }

  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }

  getAuthMiddleware(allowedRoles = []) {
    return (req, res, next) => {
      const token = req.cookies?.token || 
                   req.headers.authorization?.replace('Bearer ', '') || 
                   req.query.token;

      if (!token) {
        return res.status(401).json({ 
          error: 'Authentication required. Please login.',
          code: 'NO_TOKEN'
        });
      }

      const decoded = this.verifyToken(token);
      
      if (!decoded) {
        return res.status(401).json({ 
          error: 'Invalid or expired token. Please login again.',
          code: 'INVALID_TOKEN'
        });
      }

      // Check if token is about to expire (within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = decoded.exp - now;
      if (expiresIn < 300) { // 5 minutes
        res.set('X-Token-Expiring-Soon', 'true');
      }

      // Check role if specified
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions to access this resource.',
          code: 'FORBIDDEN',
          requiredRoles: allowedRoles,
          userRole: decoded.role
        });
      }

      req.user = decoded;
      req.token = token;
      next();
    };
  }

  // Middleware for optional authentication
  getOptionalAuthMiddleware() {
    return (req, res, next) => {
      const token = req.cookies?.token || 
                   req.headers.authorization?.replace('Bearer ', '') || 
                   req.query.token;

      if (token) {
        const decoded = this.verifyToken(token);
        if (decoded) {
          req.user = decoded;
          req.token = token;
        }
      }
      
      next();
    };
  }
}

module.exports = new JwtService();