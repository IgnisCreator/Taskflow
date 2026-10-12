// Creates (or with --reset, recreates) a throwaway test database on the server in DATABASE_URL.
// Refuses the development database, which holds real data.
import pg from "pg";

const reset = process.argv.includes("--reset");
const url = new URL(process.env.DATABASE_URL);
const name = url.pathname.slice(1);
if (!/^taskflow_(ci|test|e2e)$/.test(name)) {
  throw new Error(
    `Refusing to touch database "${name}": only taskflow_ci, taskflow_test or taskflow_e2e`,
  );
}
url.pathname = "/postgres";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
if (reset) await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
const { rowCount } = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [name],
);
if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
await client.end();
console.log(`database ${name} ready${reset ? " (recreated)" : ""}`);
