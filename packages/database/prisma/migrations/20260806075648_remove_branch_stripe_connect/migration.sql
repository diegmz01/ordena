-- DropIndex
DROP INDEX "Branch_stripeAccountId_key";

-- AlterTable
ALTER TABLE "Branch" DROP COLUMN "stripeAccountId",
DROP COLUMN "stripeChargesEnabled",
DROP COLUMN "stripeDetailsSubmitted",
DROP COLUMN "stripeOnboardingComplete",
DROP COLUMN "stripePayoutsEnabled";
