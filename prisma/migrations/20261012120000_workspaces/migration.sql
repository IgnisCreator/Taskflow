-- Workspaces, spaces, folders and lists replace isolated projects. Hand-written so that no data is lost:
-- each owner gets one workspace; each project becomes a list inside its own PRIVATE space whose members
-- are the project's members, so nobody gains access to a board they could not see before.
-- Workspace role = the highest role the user had in any of that owner's projects (VIEWER -> GUEST).

CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleLabels" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpaceMember" (
    "spaceId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("spaceId","userId")
);
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- Project -> List (same rows, same ids).
ALTER TABLE "Project" RENAME TO "List";
ALTER TABLE "List" RENAME CONSTRAINT "Project_pkey" TO "List_pkey";
ALTER TABLE "List" ADD COLUMN "spaceId" TEXT, ADD COLUMN "folderId" TEXT;

-- Data: one workspace per owner, one private space per project.
CREATE TEMP TABLE ws_map AS
  SELECT o."ownerId", gen_random_uuid()::text AS ws_id
  FROM (SELECT DISTINCT "ownerId" FROM "List") o;
CREATE TEMP TABLE space_map AS
  SELECT l.id AS list_id, l.name, m.ws_id, gen_random_uuid()::text AS space_id
  FROM "List" l JOIN ws_map m ON m."ownerId" = l."ownerId";

INSERT INTO "Workspace" ("id", "name", "updatedAt")
  SELECT m.ws_id, u.name || '''s workspace', CURRENT_TIMESTAMP
  FROM ws_map m JOIN "user" u ON u.id = m."ownerId";

INSERT INTO "WorkspaceMember" ("workspaceId", "userId", "role")
  SELECT s.ws_id, pm."userId",
    (CASE
      WHEN bool_or(pm."userId" = l."ownerId") THEN 'OWNER'
      WHEN bool_or(pm.role = 'ADMIN') THEN 'ADMIN'
      WHEN bool_or(pm.role = 'MEMBER') THEN 'MEMBER'
      ELSE 'GUEST'
    END)::"WorkspaceRole"
  FROM "ProjectMember" pm
  JOIN "List" l ON l.id = pm."projectId"
  JOIN space_map s ON s.list_id = l.id
  GROUP BY s.ws_id, pm."userId";

INSERT INTO "Space" ("id", "workspaceId", "name", "isPrivate")
  SELECT space_id, ws_id, name, true FROM space_map;

INSERT INTO "SpaceMember" ("spaceId", "workspaceId", "userId")
  SELECT s.space_id, s.ws_id, pm."userId"
  FROM "ProjectMember" pm JOIN space_map s ON s.list_id = pm."projectId";

UPDATE "List" l SET "spaceId" = s.space_id FROM space_map s WHERE s.list_id = l.id;
ALTER TABLE "List" ALTER COLUMN "spaceId" SET NOT NULL;

-- Ownership now lives in WorkspaceMember.
ALTER TABLE "List" DROP CONSTRAINT "Project_ownerId_fkey";
ALTER TABLE "List" DROP COLUMN "ownerId";

-- projectId -> listId on columns and tasks.
ALTER TABLE "BoardColumn" DROP CONSTRAINT "BoardColumn_projectId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_assigneeId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_columnId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";
ALTER TABLE "BoardColumn" RENAME COLUMN "projectId" TO "listId";
ALTER TABLE "Task" RENAME COLUMN "projectId" TO "listId";
ALTER INDEX "BoardColumn_projectId_id_key" RENAME TO "BoardColumn_listId_id_key";
ALTER INDEX "BoardColumn_projectId_position_key" RENAME TO "BoardColumn_listId_position_key";
ALTER INDEX "Task_projectId_columnId_position_idx" RENAME TO "Task_listId_columnId_position_idx";
ALTER INDEX "Task_projectId_assigneeId_idx" RENAME TO "Task_listId_assigneeId_idx";
ALTER INDEX "Task_projectId_priority_idx" RENAME TO "Task_listId_priority_idx";

DROP TABLE "ProjectMember";
DROP TYPE "ProjectRole";

CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX "Space_workspaceId_idx" ON "Space"("workspaceId");
CREATE INDEX "SpaceMember_workspaceId_userId_idx" ON "SpaceMember"("workspaceId", "userId");
CREATE INDEX "Folder_spaceId_idx" ON "Folder"("spaceId");
CREATE INDEX "List_spaceId_idx" ON "List"("spaceId");
CREATE INDEX "List_folderId_idx" ON "List"("folderId");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Space" ADD CONSTRAINT "Space_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "WorkspaceMember"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "List" ADD CONSTRAINT "List_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "List" ADD CONSTRAINT "List_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_listId_columnId_fkey" FOREIGN KEY ("listId", "columnId") REFERENCES "BoardColumn"("listId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
