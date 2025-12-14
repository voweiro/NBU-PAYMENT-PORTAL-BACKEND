const ApiResponse = require('../utils/apiResponse');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AdminsController {
  constructor(adminModel) {
    this.adminModel = adminModel;
  }

  async login(req, res) {
    try {
      const { email, password } = req.validated.body || req.body;
      const admin = await this.adminModel.findByEmail(email);
      if (!admin) return ApiResponse.error(res, 'Invalid credentials', 401);
      const ok = await bcrypt.compare(password, admin.password);
      if (!ok) return ApiResponse.error(res, 'Invalid credentials', 401);
      const token = jwt.sign({ id: admin.admin_id, role: admin.role, email }, process.env.JWT_SECRET, { expiresIn: '1d' });
      return ApiResponse.ok(res, { token });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async create(req, res) {
    try {
      const { name, email, password, role = 'admin' } = req.validated.body || req.body;
      const existing = await this.adminModel.findByEmail(email);
      if (existing) return ApiResponse.error(res, 'Email already exists', 400);
      const passwordHash = await bcrypt.hash(password, 10);
      const admin = await this.adminModel.create({ name, email, password: passwordHash, role });
      return ApiResponse.ok(res, { admin_id: admin.admin_id, name: admin.name, email: admin.email, role: admin.role, created_at: admin.created_at }, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }


  async list(req, res) {
    try {
      const admins = await this.adminModel.list();
      return ApiResponse.ok(res, admins);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.validated?.body || req.body;
      
      // Prevent updating password directly through this endpoint if not intended
      // or handle password hashing if password is provided
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
      }

      const admin = await this.adminModel.update(Number(id), data);
      // Exclude password from response
      const { password, ...adminWithoutPassword } = admin;
      return ApiResponse.ok(res, adminWithoutPassword);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async remove(req, res) {
    try {
      const { id } = req.params;
      const adminId = Number(id);

      // Prevent self-deletion
      // req.user is populated by authenticateJWT middleware
      if (req.user && req.user.id === adminId) {
        return ApiResponse.error(res, 'Cannot delete your own account', 403);
      }

      await this.adminModel.delete(adminId);
      return ApiResponse.ok(res, { id: adminId });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = AdminsController;