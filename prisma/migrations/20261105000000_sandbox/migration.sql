-- The shared read-only demo is replaced by a temporary sandbox per visitor: drop the old one.
DELETE FROM "Workspace" WHERE "isDemo";
DELETE FROM "user" WHERE "id" = 'demo-visitor';

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "isDemo";

-- AlterTable
ALTER TABLE "user" ADD COLUMN "sandboxUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "user_sandboxUntil_idx" ON "user"("sandboxUntil");
