-- Configurable workflows: each stage (column) gets a category, an optional WIP limit and policy, and
-- one stage per list is the commitment point. Organisations can save flows as templates and pick a
-- default template per space or folder.

CREATE TYPE "StageCategory" AS ENUM ('BACKLOG', 'ACTIVE', 'WAITING', 'DONE', 'DISCARDED');

-- Existing columns: the first is to do, the last is done, the rest are active, and the commitment
-- point is the second one. A list with fewer than three columns has no active stage, so it is not
-- a valid flow yet: the flow editor asks for the missing stages before it can be saved.
ALTER TABLE "BoardColumn"
  ADD COLUMN "category" "StageCategory" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "isCommitmentPoint" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "policy" TEXT,
  ADD COLUMN "wipLimit" INTEGER;

WITH ranked AS (
  SELECT id,
    row_number() OVER (PARTITION BY "listId" ORDER BY position) AS first_to_last,
    row_number() OVER (PARTITION BY "listId" ORDER BY position DESC) AS last_to_first
  FROM "BoardColumn"
)
UPDATE "BoardColumn" c SET
  "category" = (CASE
    WHEN r.first_to_last = 1 THEN 'BACKLOG'
    WHEN r.last_to_first = 1 THEN 'DONE'
    ELSE 'ACTIVE'
  END)::"StageCategory",
  "isCommitmentPoint" = (r.first_to_last = 2 AND r.last_to_first > 1)
FROM ranked r WHERE r.id = c.id;

ALTER TABLE "BoardColumn" ALTER COLUMN "category" DROP DEFAULT;

ALTER TABLE "Folder" ADD COLUMN "defaultTemplate" TEXT;
ALTER TABLE "Space" ADD COLUMN "defaultTemplate" TEXT;

CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowTemplate_workspaceId_idx" ON "WorkflowTemplate"("workspaceId");
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
