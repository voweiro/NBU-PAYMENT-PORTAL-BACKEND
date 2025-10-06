-- CreateEnum
CREATE TYPE "Level" AS ENUM ('L100', 'L200', 'L300', 'L400', 'L500', 'L600', 'ALL');

-- AlterTable
ALTER TABLE "Fee" ADD COLUMN     "levels" "Level"[] DEFAULT ARRAY[]::"Level"[];
