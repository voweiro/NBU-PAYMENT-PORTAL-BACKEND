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
    program_id: z.string(),
    fee_category: z.string().min(2),
    amount: z.number().positive(),
    session: z.string().optional(),
    semester: z.string().optional(),
    levels: z.array(LevelEnum).default([]).optional(),
  }),
});

const FeeUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    fee_category: z.string().min(2).optional(),
    amount: z.number().positive().optional(),
    session: z.string().optional(),
    semester: z.string().optional(),
    levels: z.array(LevelEnum).optional(),
  }),
});

const PaymentInitiateSchema = z.object({
  body: z
    .object({
      feeId: z.string().optional(),
      feeIds: z.array(z.string()).min(1, 'Select at least one fee').optional(),
      studentEmail: z.string().email(),
      studentName: z.string().min(1),
      gateway: z.enum(['paystack', 'flutterwave', 'global']).default('global'),
      jambNumber: z.string().min(5).optional(),
      matricNumber: z.string().min(5).optional(),
      level: z.enum(['L100', 'L200', 'L300', 'L400', 'L500', 'L600', 'ALL']).optional(),
      percent: z.number().optional(),
      // GlobalPay requires numeric 11-digit phone; enforce at schema level
      phoneNumber: z.string().regex(/^\d{11}$/, 'Phone number must be 11 digits').optional(),
      // Address recommended > 5 chars per GlobalPay docs
      address: z.string().min(6, 'Address must be at least 6 characters').optional(),
    })
    .refine((data) => Boolean(data.feeId) || (Array.isArray(data.feeIds) && data.feeIds.length > 0), {
      message: 'Provide either feeId or feeIds',
      path: ['feeId'],
    }),
});

const PaymentVerifySchema = z.object({
  params: z.object({ reference: z.string().min(3) }),
  query: z.object({ gateway: z.enum(['paystack', 'flutterwave', 'global']) }),
});

const BalanceInitiateSchema = z.object({
  body: z.object({
    reference: z.string().min(3),
    gateway: z.enum(['paystack', 'flutterwave', 'global']).default('global'),
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
  BalanceInitiateSchema,
  BalanceProcessSchema,
  AdminLoginSchema,
  AdminCreateSchema,
  AdminUpdateSchema,
};