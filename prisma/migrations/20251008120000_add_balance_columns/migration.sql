-- AlterTable: add balance tracking columns to Payment
ALTER TABLE "Payment" ADD COLUMN     "percentage_paid" DECIMAL(5,2);
ALTER TABLE "Payment" ADD COLUMN     "balance_due" DECIMAL(14,2);