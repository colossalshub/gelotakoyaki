import path from "node:path";
import { defineConfig } from "vitest/config";

const testDatabaseUrl =
  "postgresql://gelos:gelos_local_dev@127.0.0.1:5432/gelos_test";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: "test-session-secret-must-be-long-enough-for-hmac-32chars",
      BCRYPT_ROUNDS: "4",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
