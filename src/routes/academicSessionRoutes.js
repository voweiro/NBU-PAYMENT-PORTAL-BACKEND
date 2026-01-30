const express = require('express');
const router = express.Router();
const AcademicSessionController = require('../controllers/AcademicSessionController');
const AcademicSessionModel = require('../models/AcademicSessionModel');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const sessionModel = new AcademicSessionModel(prisma);
const sessionController = new AcademicSessionController(sessionModel);

// Middleware to check admin role (assuming you have one, or reuse existing auth middleware)
// For now, we'll assume the main app.js applies general auth or we add it here if needed.
// const { authenticate, authorize } = require('../middleware/auth');

router.get('/', (req, res) => sessionController.listAll(req, res));
router.post('/', (req, res) => sessionController.create(req, res));
router.put('/:id', (req, res) => sessionController.update(req, res));
router.delete('/:id', (req, res) => sessionController.delete(req, res));

module.exports = router;
