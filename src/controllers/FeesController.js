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
      const fees = await this.feeModel.getByProgramId(programId);
      return ApiResponse.ok(res, fees);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async create(req, res) {
    try {
      const { program_id, fee_category, amount, session, semester, levels } = req.validated.body || req.body;
      const fee = await this.feeModel.create({
        program_id: Number(program_id),
        fee_category,
        amount,
        session,
        semester,
        levels: Array.isArray(levels) ? levels : [],
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
      const fee = await this.feeModel.update(Number(id), data);
      return ApiResponse.ok(res, fee);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
  //please work

  async remove(req, res) {
    try {
      const { id } = req.params;
      const feeId = Number(id);

      // Check if there are any payments associated with this fee
      const hasPayments = await this.feeModel.prisma.payment.findFirst({ 
        where: { fee_id: feeId } 
      });
      
      if (hasPayments) {
        return ApiResponse.error(
          res, 
          'Cannot delete fee while payments exist. This fee has associated payment records that must be handled first.', 
          400
        );
      }

      await this.feeModel.delete(feeId);
      return ApiResponse.ok(res, { id: feeId });
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