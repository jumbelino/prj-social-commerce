import { defineConfig, devices } from "@playwright/test";

const port = 3001;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3001",
    url: `${baseURL}/`,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "dev-secret",
      NEXT_PUBLIC_OIDC_AUTHORITY:
        process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "http://localhost:8080/realms/social-commerce",
      OIDC_INTERNAL_AUTHORITY:
        process.env.OIDC_INTERNAL_AUTHORITY ?? "http://localhost:8080/realms/social-commerce",
      NEXT_PUBLIC_OIDC_CLIENT_ID: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "social-commerce-frontend",
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000",
      INTERNAL_API_BASE_URL: process.env.INTERNAL_API_BASE_URL ?? "http://localhost:8000",
      OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET ?? "",
    },
  },
});
