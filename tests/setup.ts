// Fixed test values: tests never use real GitHub credentials or the .env secrets.
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.AUTH_GITHUB_ID = "test-github-id";
process.env.AUTH_GITHUB_SECRET = "test-github-secret";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL ??=
  "postgresql://taskflow:taskflow@localhost:5432/taskflow";
