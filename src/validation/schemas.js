const { z } = require('zod');

const ProgramCreateSchema = z.object({
  body: z.object({
    program_name: z.string().min(2),
    program_type: z.enum(['undergraduate', 'postgraduate', 'diploma', 'pre_degree']),
  }),
});

const ProgramUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    program_name: z.string().min(2).optional(),
    program_type: z.enum(['undergraduate', 'postgraduate', 'diploma', 'pre_degree']).optional(),
  }),
});

const LevelEnum = z.enum(['L100', 'L200', 'L300', 'L400', 'L500', 'L600', 'ALL']);

const FeeCreateSchema = z.object({
  body: z.object({
    programId: z.string().optional(),
    programType: z.string().optional(),
    name: z.string().min(2),
    amount: z.number().positive().max(999999999999.99, 'Amount exceeds maximum allowed (<= 999,999,999,999.99)'),
    semester: z.string().optional(),
    levels: z.union([
      z.array(LevelEnum),
      z.array(z.string())
    ]).default([]).optional(),
    type: z.string().optional(),
    mandatory: z.boolean().optional(),
    currency: z.string().default('NGN').optional(),
    description: z.string().optional(),
    sessionId: z.string().optional(),
    facultyId: z.string().optional(),
    departmentId: z.string().optional(),
    hostelType: z.string().optional(),
    programLevelId: z.string().optional(),
  }),
});

const FeeUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(2).optional(),
    amount: z.number().positive().max(999999999999.99, 'Amount exceeds maximum allowed (<= 999,999,999,999.99)').optional(),
    semester: z.string().optional(),
    levels: z.union([
      z.array(LevelEnum),
      z.array(z.string())
    ]).optional(),
    type: z.string().optional(),
    mandatory: z.boolean().optional(),
    currency: z.string().optional(),
    description: z.string().optional(),
    sessionId: z.string().optional(),
    facultyId: z.string().optional(),
    departmentId: z.string().optional(),
    hostelType: z.string().optional(),
    programType: z.string().optional(),
    programLevelId: z.string().optional(),
    programId: z.string().optional(),
  }),
});

const PaymentInitiateSchema = z.object({
  body: z
    .object({
      feeId: z.string().optional(),
      feeIds: z.array(z.string()).min(1, 'Select at least one fee').optional(),
      userId: z.string().optional(),
      studentEmail: z.string().email(),
      studentName: z.string().min(1),
      gateway: z.enum(['paystack', 'flutterwave', 'global']).default('global'),
      jambNumber: z.string().min(5).optional(),
      matricNumber: z.string().optional(),
    applicantId: z.string().optional(),
    applicationId: z.string().optional(),
    programType: z.string().optional(),
    level: z.enum(['L100', 'L200', 'L300', 'L400', 'L500', 'L600', 'ALL']).optional(),
      percent: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).optional(),
      // GlobalPay requires numeric 11-digit phone; enforce at schema level
      phoneNumber: z.string().regex(/^\d{10,15}$/, 'Phone number must be 10 to 15 digits').optional(),
      // Address recommended > 5 chars per GlobalPay docs
      address: z.string().min(6, 'Address must be at least 6 characters').optional(),
      sessionId: z.union([z.string(), z.number()]).optional(),
    })
    .refine((data) => Boolean(data.feeId) || (Array.isArray(data.feeIds) && data.feeIds.length > 0), {
      message: 'Provide either feeId or feeIds',
      path: ['feeId'],
    }),
});

const PaymentManualSchema = z.object({
  body: z.object({
    fee_id: z.string().optional(),
    feeIds: z.array(z.string()).optional(),
    items: z.array(z.any()).optional(),
    student_email: z.string().email(),
    student_name: z.string().min(1),
    amount_paid: z.number().positive(),
    jamb_number: z.string().optional(),
    matric_number: z.string().optional(),
    level: LevelEnum.optional(),
    phone_number: z.string().optional(),
    address: z.string().optional(),
    is_balance_payment: z.boolean().optional(),
    original_reference: z.string().optional(),
    sessionId: z.number().optional(),
    bankTransferRef: z.string().optional(),
  }).refine((data) => Boolean(data.fee_id) || (Array.isArray(data.items) && data.items.length > 0) || (Array.isArray(data.feeIds) && data.feeIds.length > 0), {
    message: 'Provide fee_id, feeIds, or items',
    path: ['fee_id'],
  }),
});

const PaymentVerifySchema = z.object({
  params: z.object({ reference: z.string().min(3) }),
  query: z.object({
    gateway: z.enum(['paystack', 'flutterwave', 'global']),
    original_reference: z.string().min(3).optional(),
  }),
});

const BalanceInitiateSchema = z.object({
  body: z.object({
    reference: z.string().min(3),
    gateway: z.enum(['paystack', 'flutterwave', 'global']).default('global'),
    // Optional overrides; required for GlobalPay if not present on original payment
    phoneNumber: z.string().regex(/^\d{10,15}$/, 'Phone number must be 10 to 15 digits').optional(),
    address: z.string().min(6, 'Address must be at least 6 characters').optional(),
  }),
});

const BalanceProcessSchema = z.object({
  body: z.object({
    reference: z.string().min(3),
    amount: z.number().positive(),
  }),
});

const AdminLoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

const AdminCreateSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['super_admin', 'admin']).default('admin'),
  }),
});

const AdminUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    role: z.enum(['super_admin', 'admin']).optional(),
  }),
});

module.exports = {
  ProgramCreateSchema,
  ProgramUpdateSchema,
  FeeCreateSchema,
  FeeUpdateSchema,
  PaymentInitiateSchema,
  PaymentVerifySchema,
  PaymentManualSchema,
  BalanceInitiateSchema,
  BalanceProcessSchema,
  AdminLoginSchema,
  AdminCreateSchema,
  AdminUpdateSchema,
};
