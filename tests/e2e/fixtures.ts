import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";
import { PrismaClient } from "../../src/generated/prisma/client";
import { E2E_DATABASE_URL, E2E_ORIGIN, E2E_SECRET } from "./env";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: E2E_DATABASE_URL }),
});

// Test-only auth instance: same secret and database as the server under test, plus session helpers.
const auth = betterAuth({
  baseURL: E2E_ORIGIN,
  secret: E2E_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  plugins: [testUtils()],
});

export type TestUser = {
  id: string;
  /** For the browser (`context.addCookies`). */
  cookies: Awaited<ReturnType<typeof browserCookies>>;
  /** For direct HTTP calls from the test, acting as this user. */
  cookie: string;
};

async function browserCookies(userId: string) {
  const ctx = await auth.$context;
  return ctx.test.getCookies({ userId, domain: "localhost" });
}

export async function createUser(label: string): Promise<TestUser> {
  const ctx = await auth.$context;
  const user = ctx.test.createUser({
    email: `${label}-${randomUUID().slice(0, 8)}@example.test`,
    name: label,
  });
  await ctx.test.saveUser(user);
  const headers = await ctx.test.getAuthHeaders({ userId: user.id });
  return {
    id: user.id,
    cookies: await browserCookies(user.id),
    cookie: headers.get("cookie") ?? "",
  };
}

export const COLUMNS = ["To do", "In progress", "In review", "Done"];

/** An owner, a member, and a project with Alpha, Bravo, Charlie in "To do" and Delta in "In progress". */
export async function seedBoard() {
  const owner = await createUser("owner");
  const member = await createUser("member");
  const project = await prisma.project.create({
    data: {
      name: "E2E project",
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, role: "ADMIN" },
          { userId: member.id, role: "MEMBER" },
        ],
      },
      columns: {
        create: COLUMNS.map((name, position) => ({ name, position })),
      },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  const [todo, doing] = project.columns;
  const rows: [string, string, number][] = [
    ["Alpha", todo!.id, 0],
    ["Bravo", todo!.id, 1],
    ["Charlie", todo!.id, 2],
    ["Delta", doing!.id, 0],
  ];
  await prisma.task.createMany({
    data: rows.map(([title, columnId, position]) => ({
      projectId: project.id,
      columnId,
      title,
      position,
      createdById: owner.id,
    })),
  });
  return { projectId: project.id, owner, member };
}

export async function cleanup() {
  await prisma.project.deleteMany({
    where: { owner: { email: { endsWith: "@example.test" } } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@example.test" } },
  });
}

/** What the server says the board looks like: column name -> task titles in order. */
export async function serverBoard(projectId: string, user: TestUser) {
  const res = await fetch(`${E2E_ORIGIN}/api/projects/${projectId}/board`, {
    headers: { cookie: user.cookie },
  });
  const board = (await res.json()) as {
    columns: { name: string; tasks: { title: string }[] }[];
  };
  return Object.fromEntries(
    board.columns.map((c) => [c.name, c.tasks.map((t) => t.title)]),
  );
}

/** Another user moves a task through the API, which raises the board version behind the page's back. */
export async function moveAs(
  user: TestUser,
  projectId: string,
  title: string,
  columnName: string,
  toIndex: number,
) {
  const [task, column, project] = await Promise.all([
    prisma.task.findFirstOrThrow({ where: { projectId, title } }),
    prisma.boardColumn.findFirstOrThrow({
      where: { projectId, name: columnName },
    }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
  ]);
  const res = await fetch(
    `${E2E_ORIGIN}/api/projects/${projectId}/tasks/${task.id}/move`,
    {
      method: "PATCH",
      headers: {
        cookie: user.cookie,
        origin: E2E_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        columnId: column.id,
        toIndex,
        expectedBoardVersion: project.boardVersion,
      }),
    },
  );
  if (!res.ok) throw new Error(`moveAs failed: ${res.status}`);
}
