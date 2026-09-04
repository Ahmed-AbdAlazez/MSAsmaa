import { defineConfig } from "vite";

// Express API server (root server.js) runs here during development.
const API_TARGET = process.env.API_ORIGIN || "http://localhost:3000";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // main.js calls three path shapes against VITE_API_URL (""):
      //   ${API_BASE}/api/...      -> already correct on the backend
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      //   ${API_BASE}/auth/...     -> backend mounts auth at /api/auth
      "/auth": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/auth/, "/api/auth"),
      },
      //   ${API_BASE}/lessons/...  -> backend mounts video routes at /api/lessons
      "/lessons": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lessons/, "/api/lessons"),
      },
      //   ${API_BASE}/live/...     -> backend mounts live routes at /api/live
      "/live": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/live/, "/api/live"),
      },
    },
  },

  // Multi-page app: every HTML page at the repo root is a build entry.
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        login: "login.html",
        "forgot-password": "forgot-password.html",
        "reset-password": "reset-password.html",
        "course-biology": "course-biology.html",
        courses: "courses.html",
        lessons: "lessons.html",
        "lesson-view": "lesson-view.html",
        exams: "exams.html",
        "dashboard-teacher": "dashboard-teacher.html",
        "registration-requests": "registration-requests.html",
        students: "students.html",
        "student-mistakes": "student-mistakes.html",
        "live-session": "live-session.html",
        scoreboard: "scoreboard.html",
      },
    },
  },
});
