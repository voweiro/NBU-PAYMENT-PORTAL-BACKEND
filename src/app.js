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
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/programs', programsRouter);
app.use('/api/fees', feesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/admins', adminsRouter);
app.use('/api/dashboard', dashboardRouter);

module.exports = app;