// Must be the first import. The service modules pulled in below read
// process.env at their top level, and ESM evaluates every import before this
// module's body runs — so calling dotenv.config() down there left all of them
// reading undefined, and every key in server/.env was silently ignored.
import "dotenv/config";

import express from "express";
import cors from "cors";
import prisma from "./src/config/db.js";

import titlesRoutes from "./src/routes/titles.js";

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration supporting dev & production origins
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "https://apiplayer.ru",
  "https://onion.tv",
];

const isProduction = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser callers — curl, the smoke test, server-to-server — send no
      // Origin at all, and CORS does not apply to them.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      if (!isProduction) {
        console.warn(`CORS: allowing unlisted origin ${origin} (development only)`);
        return callback(null, true);
      }

      // Refuse by withholding the header rather than throwing: the browser
      // blocks the response, and the request does not become a 500.
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());

// API Root Info Route
app.get("/", (req, res) => {
  return res.status(200).json({
    name: "Onion VOD Backend API",
    status: "online",
    health: "/health",
    frontendUrl: "http://localhost:5173",
    endpoints: {
      titles: "/titles",
    },
  });
});

// Health Check Route
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "ok", message: "Onion VOD server & database healthy" });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Database connection failed", error: error.message });
  }
});

// API Routes Mounting
app.use("/titles", titlesRoutes);

// Global 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error. Please try again." });
});

app.listen(PORT, () => {
  console.log(`🚀 Onion VOD server running on http://localhost:${PORT}`);
});
