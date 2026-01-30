require("dotenv").config();
const express = require("express");
const cors = require("cors");

const programsRouter = require("./routes/programs");
const feesRouter = require("./routes/fees");
const paymentsRouter = require("./routes/payments");
const receiptsRouter = require("./routes/receipts");
const adminsRouter = require("./routes/admins");
const dashboardRouter = require("./routes/dashboard");
const academicSessionRouter = require("./routes/academicSessionRoutes");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// 1. HELMET: Secure HTTP headers (CSP, HSTS, XSS protection, etc.)
app.use(helmet());

// 2. RATE LIMITING: Prevent brute-force and DDoS
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { success: false, message: "Too many requests from this IP, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", globalLimiter);

// 3. CORS configuration: allow frontend URL and local dev origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL?.replace("https://", "http://"),
  "http://localhost:3000",
  "https://payment-portal.nbu.edu.ng",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
// Note: Preflight OPTIONS are handled by the cors middleware above.
// Avoid wildcard path here due to path-to-regexp incompatibilities on some runtimes.
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

// Root endpoint
app.get("/", (req, res) => {
  res.json({ success: true, message: "API is live ✅" });
});

app.use("/api/programs", programsRouter);
app.use("/api/fees", feesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/admins", adminsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/academic-sessions", academicSessionRouter);

// Handle 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// 4. GLOBAL ERROR HANDLER: Sanitize error responses
app.use((err, req, res, next) => {
  console.error("❌ Fatal Error:", err.stack);
  
  const status = err.status || 500;
  const message = process.env.NODE_ENV === "production" 
    ? "An internal server error occurred" 
    : err.message;

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack })
  });
});

module.exports = app;
