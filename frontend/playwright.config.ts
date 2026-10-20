import { defineConfig, devices } from "@playwright/test"

import { API_BASE_URL, APP_BASE_URL } from "./e2e/constants"

const backendEnv = {
  DATABASE_URL: "sqlite:///./e2e.db",
  ENVIRONMENT: "development",
  JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-123456",
  HOST_EMAIL: "host@example.com",
  HOST_PASSWORD: "e2e-password-change-me",
  HOST_TIMEZONE: "Europe/Moscow",
  CORS_ORIGINS: APP_BASE_URL,
  PUBLIC_BASE_URL: APP_BASE_URL,
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: APP_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command:
        "bash -c 'set -e; rm -f e2e.db; uv run alembic upgrade head; uv run python -m app.seed; exec uv run uvicorn main:app --host 127.0.0.1 --port 8000'",
      cwd: "../backend",
      url: `${API_BASE_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: backendEnv,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      url: APP_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_BASE_URL: API_BASE_URL },
    },
  ],
})
