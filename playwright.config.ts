import { defineConfig, devices } from "@playwright/test";
import { ambienteLocal } from "./tests/integration/helpers";

const demoPort = Number(process.env.PLAYWRIGHT_DEMO_PORT || "3101");
if (!Number.isInteger(demoPort) || demoPort < 1024 || demoPort > 65535)
  throw new Error(
    "PLAYWRIGHT_DEMO_PORT precisa ser uma porta entre 1024 e 65535.",
  );
const demoURL = `http://127.0.0.1:${demoPort}`;
const liveURL = "https://127.0.0.1:3100";
const servidor = (porta: number, demonstracao: boolean) => ({
  command: demonstracao
    ? `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${porta}`
    : "node scripts/servidor-e2e-https.mjs",
  url: demonstracao ? demoURL : liveURL,
  ignoreHTTPSErrors: !demonstracao,
  timeout: 120000,
  reuseExistingServer: false,
  env: {
    APP_URL: demonstracao ? demoURL : liveURL,
    ...(demonstracao
      ? {
          SUPABASE_URL: "",
          SUPABASE_PUBLISHABLE_KEY: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
        }
      : {}),
    RESEND_API_KEY: "",
    NOTIFICATION_WORKER_SECRET: "",
  },
});

export default defineConfig({
  testDir: "./tests/e2e",
  // O Playwright limpa esta pasta antes da execução.
  outputDir: "test-results/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45000,
  globalTimeout: 15 * 60000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      name: "demo-desktop",
      testMatch: "demo.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: demoURL,
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "demo-mobile-320",
      testMatch: "demo.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: demoURL,
        viewport: { width: 320, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "demo-mobile-360",
      testMatch: "demo.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: demoURL,
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "demo-mobile-390",
      testMatch: "demo.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: demoURL,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "supabase-local",
      testMatch: "supabase.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: liveURL,
        trace: "off",
        ignoreHTTPSErrors: true,
      },
    },
  ],
  webServer: [
    servidor(demoPort, true),
    ...(ambienteLocal ? [servidor(3100, false)] : []),
  ],
});
