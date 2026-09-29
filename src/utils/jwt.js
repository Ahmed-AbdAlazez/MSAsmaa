const jwt = require('jsonwebtoken');

/**
 * Sign a new JWT token containing user ID and role
 * @param {Object} payload - Token payload containing { id, role }
 * @returns {string} Signed JWT token
 */
const getCleanSecret = () => {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }
  return String(raw).replace(/^["']|["']$/g, '').trim();
};

const getCleanExpiresIn = () => {
  const raw = process.env.JWT_EXPIRES_IN || '30d';
  const clean = String(raw).replace(/^["']|["']$/g, '').trim();
  return clean || '30d';
};

const signToken = (payload) => {
  const secret = getCleanSecret();
  const expiresIn = getCleanExpiresIn();

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
  const secret = getCleanSecret();

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
