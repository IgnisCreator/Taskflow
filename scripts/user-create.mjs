// Creates a user for a closed deployment (there is no public sign-up there):
//
//   npm run user:create -- --email ana@example.com --name "Ana Perez" [--digest]
//                          [--workspace <workspace id> --role MEMBER]
//
// The password is read from USER_PASSWORD or typed (hidden) at the prompt; it is never an argument
// and never printed. The account is created already verified and signs in with email and password.
// DATABASE_URL must point at the database to use (node --env-file=.env loads it).
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const ROLES = ["ADMIN", "MEMBER", "GUEST"]; // the OWNER is the one who creates the workspace
const MAX_MEMBERS = 20; // same limit as the app: a workspace has at most 20 people

function fail(message) {
  console.error(`user:create: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    digest: { type: "boolean", default: false },
    workspace: { type: "string" },
    role: { type: "string", default: "MEMBER" },
  },
});

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  fail("give a valid --email");
if (!name || name.length > 100) fail("give a --name of 1 to 100 characters");
if (!ROLES.includes(values.role))
  fail(`--role must be one of ${ROLES.join(", ")}`);
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set");

/** Reads a line without echoing it (the password is never an argument or shown). */
function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let line = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(line);
        }
        if (char === "\u0003") process.exit(130);
        line = char === "\u007f" ? line.slice(0, -1) : line + char;
      }
    };
    process.stdin.on("data", onData);
  });
}

let password = process.env.USER_PASSWORD;
if (password === undefined) {
  if (!process.stdin.isTTY)
    fail("set USER_PASSWORD, or run it in a terminal to type the password");
  password = await askHidden("Password (10 to 128 characters): ");
  if (password !== (await askHidden("Repeat the password: ")))
    fail("the passwords do not match");
}
if (password.length < 10 || password.length > 128) {
  fail("the password must have 10 to 128 characters");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  if (
    (await client.query('SELECT 1 FROM "user" WHERE email = $1', [email]))
      .rowCount
  ) {
    fail(`there is already a user with that email`);
  }
  if (values.workspace) {
    const workspace = await client.query(
      'SELECT id FROM "Workspace" WHERE id = $1 FOR UPDATE',
      [values.workspace],
    );
    if (!workspace.rowCount) fail("that workspace does not exist");
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM "WorkspaceMember" WHERE "workspaceId" = $1',
      [values.workspace],
    );
    if (rows[0].n >= MAX_MEMBERS)
      fail(`that workspace already has ${MAX_MEMBERS} people`);
  }
  const id = randomUUID();
  await client.query(
    `INSERT INTO "user" (id, "publicId", name, email, "emailVerified", "digestEmail", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, true, $5, now(), now())`,
    [id, randomUUID(), name, email, values.digest],
  );
  await client.query(
    `INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
    [randomUUID(), id, await hashPassword(password)],
  );
  if (values.workspace) {
    await client.query(
      'INSERT INTO "WorkspaceMember" ("workspaceId", "userId", role) VALUES ($1, $2, $3::"WorkspaceRole")',
      [values.workspace, id, values.role],
    );
  }
  await client.query("COMMIT");
  console.log(
    `Created ${email} (${id})${values.workspace ? ` as ${values.role} of the workspace` : ""}.`,
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  fail(error.message);
} finally {
  await client.end();
}
