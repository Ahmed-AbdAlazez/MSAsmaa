const jwt = require('jsonwebtoken');

/**
 * Sign a new JWT token containing user ID and role
 * @param {Object} payload - Token payload containing { id, role }
 * @returns {string} Signed JWT token
 */
const signToken = (payload) => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }

  return jwt.sign(
    {
      id: payload.id,
      role: payload.role,
    },
    secret,
    {
      expiresIn,
    }
  );
};

/**
 * Verify a JWT token and decode its payload
 * @param {string} token - JWT token string
 * @returns {Promise<Object>} Decoded token payload
 */
const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }

  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        return reject(err);
      }
      resolve(decoded);
    });
  });
};

module.exports = {
  signToken,
  verifyToken,
};
