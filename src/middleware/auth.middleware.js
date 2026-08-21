/**
 * auth.middleware.js
 * ---------------------------------------------------------------------------
 * DEV/TEST stand-in for the real authentication middleware.
 *
 * The contract expected by video.routes.js:
 *   - Sets req.user.id   (string)
 *   - Sets req.user.role ("teacher" | "student")
 *
 * HOW IT WORKS RIGHT NOW (testing only):
 *   Reads two plain headers sent by the client:
 *     x-user-id:   any non-empty string
 *     x-user-role: "teacher" or "student" (anything else -> "student")
 *
 *   Example request:
 *     curl -H "x-user-id: student-1" -H "x-user-role: student" \
 *          http://localhost:3000/api/lessons/lesson-1/video-url
 *
 * REPLACE LATER: swap the header reading for real JWT verification
 * (Authorization: Bearer <token> -> verify -> req.user = decoded payload).
 * Keep the same exported name and the same req.user shape so nothing
 * downstream changes.
 */

function requireAuth(req, res, next) {
  const userId = req.get("x-user-id");
  const roleHeader = req.get("x-user-role");

  if (!userId || !userId.trim()) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  req.user = {
    id: userId.trim(),
    role: roleHeader === "teacher" ? "teacher" : "student",
  };

  next();
}

module.exports = { requireAuth };
