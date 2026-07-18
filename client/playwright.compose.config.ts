import { defineConfig, devices } from "@playwright/test";
import os from "os";
import path from "path";

const composeClientUrl = process.env.COMPOSE_CLIENT_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "compose.spec.ts",
  outputDir: path.join(os.tmpdir(), "coh-compose-playwright-results"),
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: path.join(os.tmpdir(), "coh-compose-playwright-report") },
    ],
  ],
  use: {
    baseURL: composeClientUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
