import { defineConfig, devices } from "@playwright/test";

// 여러 앱을 함께 띄우는 환경에서는 PLAYWRIGHT_BASE_URL로 이 앱의 주소를 지정한다.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// 브라우저가 이미 설치된 환경(예: Claude Code 원격 세션)에서는
// PLAYWRIGHT_CHROMIUM_PATH로 실행 파일을 직접 지정한다.
// 로컬에서는 비워 두고 `bunx playwright install chromium`으로 내려받는다.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
