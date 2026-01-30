const ApiResponse = require('../utils/apiResponse');

class AcademicSessionController {
  constructor(sessionModel) {
    this.sessionModel = sessionModel;
  }

  async listAll(req, res) {
    try {
      const sessions = await this.sessionModel.listAll();
      return ApiResponse.ok(res, sessions);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async create(req, res) {
    try {
      const { session_name, is_current, start_date, end_date } = req.body;
      
      if (!session_name) {
        return ApiResponse.error(res, 'Session name is required', 400);
      }

      const session = await this.sessionModel.create({
        session_name,
        is_current: Boolean(is_current),
        start_date: start_date ? new Date(start_date) : null,
        end_date: end_date ? new Date(end_date) : null,
      });
      return ApiResponse.ok(res, session, 201);
    } catch (err) {
      if (err.code === 'P2002') {
        return ApiResponse.error(res, 'Session name already exists', 400);
      }
      return ApiResponse.error(res, err);
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const { session_name, is_current, start_date, end_date } = req.body;
      
      const session = await this.sessionModel.update(id, {
        session_name,
        is_current: is_current !== undefined ? Boolean(is_current) : undefined,
        start_date: start_date ? new Date(start_date) : undefined,
        end_date: end_date ? new Date(end_date) : undefined,
      });
      return ApiResponse.ok(res, session);
    } catch (err) {
      if (err.code === 'P2002') {
        return ApiResponse.error(res, 'Session name already exists', 400);
      }
      return ApiResponse.error(res, err);
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      await this.sessionModel.delete(id);
      return ApiResponse.ok(res, { message: 'Session deleted successfully' });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = AcademicSessionController;
