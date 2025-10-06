require('dotenv').config();
const express = require('express');
const cors = require('cors');

const programsRouter = require('./routes/programs');
const feesRouter = require('./routes/fees');
const paymentsRouter = require('./routes/payments');
const receiptsRouter = require('./routes/receipts');
const adminsRouter = require('./routes/admins');
const dashboardRouter = require('./routes/dashboard');

const app = express();
// CORS configuration: allow frontend URL and local dev origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL?.replace('https://', 'http://'),
  'http://localhost:3000',
  'https://nbu-payment-portal-frontend.vercel.app',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
// Note: Preflight OPTIONS are handled by the cors middleware above.
// Avoid wildcard path here due to path-to-regexp incompatibilities on some runtimes.
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({ success: true, message: 'API is live ✅' });
});

app.use('/api/programs', programsRouter);
app.use('/api/fees', feesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/admins', adminsRouter);
app.use('/api/dashboard', dashboardRouter);

// Handle 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

module.exports = app;