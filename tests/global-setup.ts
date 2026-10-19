import { execSync } from "node:child_process";

const testDatabaseUrl =
  "postgresql://gelos:gelos_local_dev@127.0.0.1:5432/gelos_test";

export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
    },
  });
}
