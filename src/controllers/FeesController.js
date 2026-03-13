const ApiResponse = require('../utils/apiResponse');

class FeesController {
  constructor(feeModel) {
    this.feeModel = feeModel;
  }

  async getAll(req, res) {
    try {
      const fees = await this.feeModel.listAll();
      return ApiResponse.ok(res, fees);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getByProgramId(req, res) {
    try {
      const { programId } = req.params;
      // Support multiple program IDs separated by commas
      const programIds = programId.split(',').map(id => id.trim()).filter(id => id);
      const fees = await this.feeModel.getByProgramId(programIds);
      return ApiResponse.ok(res, fees);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
  
  async getApplicable(req, res) {
    try {
      const { programId, facultyId, departmentId, sessionId, programLevelId } = req.query || {};
      const fees = await this.feeModel.getApplicable({
        programId: programId || undefined,
        facultyId: facultyId || undefined,
        departmentId: departmentId || undefined,
        sessionId: sessionId || undefined,
        programLevelId: programLevelId || undefined
      });
      return ApiResponse.ok(res, fees);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async create(req, res) {
    try {
      const { programId, programType, name, amount, semester, levels, type, mandatory, description, currency, sessionId, facultyId, departmentId, hostelType, programLevelId } = req.validated.body || req.body;
      const fee = await this.feeModel.create({
        programId,
        programType,
        name,
        amount,
        semester,
        levels: Array.isArray(levels) ? levels : [],
        type,
        mandatory,
        description,
        currency,
        sessionId,
        facultyId,
        departmentId,
        hostelType,
        programLevelId
      });
      return ApiResponse.ok(res, fee, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.validated?.body || req.body;
      if (data && 'levels' in data) {
        data.levels = Array.isArray(data.levels) ? data.levels : [];
      }
      const fee = await this.feeModel.update(id, data);
      return ApiResponse.ok(res, fee);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async remove(req, res) {
    try {
      const { id } = req.params;

      // Check if there are any payments associated with this fee
      const hasPayments = await this.feeModel.prisma.payment.findFirst({ 
        where: { feeId: id } 
      });
      
      if (hasPayments) {
        return ApiResponse.error(
          res, 
          'Cannot delete fee while payments exist. This fee has associated payment records that must be handled first.', 
          400
        );
      }

      await this.feeModel.delete(id);
      return ApiResponse.ok(res, { id });
    } catch (err) {
      // Handle foreign key constraint violation gracefully
      if (err && err.code === 'P2003') {
        return ApiResponse.error(
          res,
          'Fee is referenced by payment records. Cannot delete fee with existing payments.',
          400
        );
      }
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = FeesController;
