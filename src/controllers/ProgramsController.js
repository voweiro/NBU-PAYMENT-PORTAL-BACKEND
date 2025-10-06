const ApiResponse = require('../utils/apiResponse');

class ProgramsController {
  constructor(programModel) {
    this.programModel = programModel;
  }

  async getAll(req, res) {
    try {
      const programs = await this.programModel.getAll();
      return ApiResponse.ok(res, programs);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async create(req, res) {
    try {
      const { program_name, program_type } = req.validated.body || req.body;
      const program = await this.programModel.create({ program_name, program_type });
      return ApiResponse.ok(res, program, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.validated?.body || req.body;
      const program = await this.programModel.update(Number(id), data);
      return ApiResponse.ok(res, program);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async remove(req, res) {
    try {
      const { id } = req.params;
      const programId = Number(id);

      // Prevent deletion if fees exist for this program
      const hasFees = await this.programModel.prisma.fee.findFirst({ where: { program_id: programId } });
      if (hasFees) {
        return ApiResponse.error(res, 'Cannot delete program while fees exist. Delete related fees first.', 400);
      }

      await this.programModel.delete(programId);
      return ApiResponse.ok(res, { id: programId });
    } catch (err) {
      // Handle foreign key constraint violation gracefully
      if (err && err.code === 'P2003') {
        return ApiResponse.error(
          res,
          'Program is referenced by other records (e.g., fees/payments). Delete dependents first.',
          400
        );
      }
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = ProgramsController;