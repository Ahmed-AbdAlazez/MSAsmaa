/**
 * auth.middleware.js
 * ---------------------------------------------------------------------------
 * JWT authentication for the content API (videos / lesson materials).
 *
 * Contract expected by video.routes.js / materials.routes.js:
 *   - Sets req.user.id   (string)
 *   - Sets req.user.role ("teacher" | "student" — lowercased from the JWT)
 *
 * HOW IT WORKS:
 *   Reads "Authorization: Bearer <token>" and verifies the JWT signed by
 *   utils/jwt.signToken() at POST /api/v1/auth/login (same JWT_SECRET).
 *   The token payload is { id, role } where role comes from the database.
 *   The client can no longer claim a role via headers: the ONLY trusted
 *   source is the verified token (backend is the source of truth).
 */

const { verifyToken } = require("../utils/jwt");

function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  if (!token) {
    return res.status(401).json({
      error: "مطلوب تسجيل الدخول.",
    });
  }

  verifyToken(token)
    .then((decoded) => {
      if (!decoded || !decoded.id) {
        return res.status(401).json({
          error: "رمز غير صالح. يرجى تسجيل الدخول مرة أخرى.",
        });
      }

      req.user = {
        id: String(decoded.id),
        // Routes compare against lowercase "teacher"; the DB stores TEACHER.
        role: String(decoded.role || "student").toLowerCase(),
      };

      return next();
    })
    .catch((error) => {
      return res.status(401).json({
        error:
          error && error.name === "TokenExpiredError"
            ? "انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى."
            : "رمز غير صالح. يرجى تسجيل الدخول مرة أخرى.",
      });
    });
}

module.exports = { requireAuth };
