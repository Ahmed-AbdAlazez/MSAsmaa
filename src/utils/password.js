const bcrypt = require('bcryptjs');

/**
 * Hash a plain text password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

/**
 * Compare a plain text password with a stored hash
 * @param {string} candidatePassword - Plain text password from request
 * @param {string} userPassword - Hashed password from database
 * @returns {Promise<boolean>} Match result
 */
const comparePassword = async (candidatePassword, userPassword) => {
  return bcrypt.compare(candidatePassword, userPassword);
};

module.exports = {
  hashPassword,
  comparePassword,
};
