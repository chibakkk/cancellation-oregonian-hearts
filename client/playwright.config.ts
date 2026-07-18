import { defineConfig, devices } from "@playwright/test";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const serverPort = 3101;
const clientPort = 5174;
const serverUrl = `http://127.0.0.1:${serverPort}`;
const clientUrl = `http://127.0.0.1:${clientPort}`;
const configDir = path.dirname(fileURLToPath(import.meta.url));
const e2eStateDir = path.join(os.tmpdir(), `coh-e2e-state-${process.pid}`);

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(os.tmpdir(), "coh-playwright-results"),
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(os.tmpdir(), "coh-playwright-report") }],
  ],
  use: {
    baseURL: clientUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start",
      cwd: path.resolve(configDir, "../server"),
      url: `${serverUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: String(serverPort),
        COH_STATE_DIR: path.join(e2eStateDir, "rooms"),
        COH_STATE_FILE: path.join(e2eStateDir, "legacy.json"),
      },
    },
    {
      command: `npm run dev:e2e -- --host 127.0.0.1 --port ${clientPort} --strictPort`,
      cwd: configDir,
      url: clientUrl,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        VITE_SERVER_URL: serverUrl,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
