-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('undergraduate', 'postgraduate', 'diploma', 'pre_degree');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('successful', 'pending', 'failed');

-- CreateTable
CREATE TABLE "Program" (
    "program_id" SERIAL NOT NULL,
    "program_name" TEXT NOT NULL,
    "program_type" "ProgramType" NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("program_id")
);

-- CreateTable
CREATE TABLE "Fee" (
    "fee_id" SERIAL NOT NULL,
    "program_id" INTEGER NOT NULL,
    "fee_category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "session" TEXT,
    "semester" TEXT,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("fee_id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "admin_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("admin_id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "payment_id" SERIAL NOT NULL,
    "fee_id" INTEGER NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL,
    "transaction_ref" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receipt_drive_url" TEXT,
    "student_email" TEXT NOT NULL,
    "student_name" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transaction_ref_key" ON "Payment"("transaction_ref");

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "Fee"("fee_id") ON DELETE RESTRICT ON UPDATE CASCADE;
