import { defineConfig, devices } from "@playwright/test";

const port = 3000;
const apiPort = 8000;

function getHostnameFromUrl(url: string | undefined): string {
  if (!url || url === "") return "localhost";
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "localhost";
  }
}

const envApiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const apiHost = getHostnameFromUrl(envApiUrl);

const baseURL = envApiUrl 
  ? `http://${apiHost}:${port}` 
  : `http://localhost:${port}`;

const apiBaseURL = envApiUrl || `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
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
    command: "npm run dev -- --hostname localhost --port 3000",
    url: `${baseURL}/`,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "dev-secret",
      NEXT_PUBLIC_OIDC_AUTHORITY:
        process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "http://localhost:8080/realms/social-commerce",
      OIDC_INTERNAL_AUTHORITY:
        process.env.OIDC_INTERNAL_AUTHORITY ?? "http://localhost:8080/realms/social-commerce",
      NEXT_PUBLIC_OIDC_CLIENT_ID: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "social-commerce-frontend",
      NEXT_PUBLIC_API_BASE_URL: apiBaseURL,
      INTERNAL_API_BASE_URL: apiBaseURL,
      OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET ?? "",
    },
  },
});
