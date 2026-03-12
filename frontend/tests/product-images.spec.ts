import { test, expect, type Page } from "@playwright/test";
import path from "path";

const ADMIN_EMAIL = "dev-admin";
const ADMIN_PASSWORD = "dev-admin";

function isKeycloakAuthUrl(url: string): boolean {
  return url.includes("/protocol/openid-connect/auth") || url.includes("keycloak");
}

async function getUnauthDestination(page: Page): Promise<"nextauth" | "keycloak"> {
  const nextAuthButton = page.getByRole("button", { name: "Sign in with Keycloak" });
  const timeoutMs = 15_000;
  const pollMs = 200;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (isKeycloakAuthUrl(page.url())) {
      return "keycloak";
    }

    if (await nextAuthButton.isVisible().catch(() => false)) {
      return "nextauth";
    }

    await page.waitForTimeout(pollMs);
  }

  throw new Error("Timed out waiting for unauth destination (NextAuth sign-in or Keycloak)");
}

async function continueFromNextAuthToKeycloak(page: Page): Promise<void> {
  const nextAuthButton = page.getByRole("button", { name: "Sign in with Keycloak" });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (isKeycloakAuthUrl(page.url())) {
      return;
    }

    await expect(nextAuthButton).toBeVisible({ timeout: 15_000 });
    await nextAuthButton.click({ noWaitAfter: true });

    const reachedKeycloak = await page
      .waitForURL((url) => isKeycloakAuthUrl(url.href), { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (reachedKeycloak) {
      return;
    }
  }

  throw new Error("Timed out reaching Keycloak from NextAuth sign-in page");
}

async function hasSessionAccessToken(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        return false;
      }

      const session = (await response.json()) as { accessToken?: unknown };
      return typeof session.accessToken === "string" && session.accessToken.length > 0;
    } catch {
      return false;
    }
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto("/admin");

  const destination = await getUnauthDestination(page);

  if (destination === "nextauth") {
    await continueFromNextAuthToKeycloak(page);
  }

  if (isKeycloakAuthUrl(page.url())) {
    const usernameInput = page.locator('input[name="username"], input#username');
    const passwordInput = page.locator('input[name="password"], input#password');
    const keycloakSubmit = page.locator(
      "#kc-login, button#kc-login, input#kc-login, button[type=\"submit\"], input[type=\"submit\"]"
    );

    await expect(usernameInput).toBeVisible({ timeout: 30_000 });
    await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
    await expect(keycloakSubmit.first()).toBeVisible({ timeout: 30_000 });

    await usernameInput.fill(ADMIN_EMAIL);
    await passwordInput.fill(ADMIN_PASSWORD);
    await keycloakSubmit.first().click({ noWaitAfter: true });
  }

  await page.waitForURL((url) => url.pathname === "/admin" || url.pathname.startsWith("/admin/"), {
    timeout: 30_000,
  });

  await expect
    .poll(() => hasSessionAccessToken(page), {
      timeout: 15_000,
      intervals: [250, 500, 1_000],
    })
    .toBe(true);

  if (new URL(page.url()).pathname !== "/admin") {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/admin`);
  }

  await expect
    .poll(() => hasSessionAccessToken(page), {
      timeout: 15_000,
      intervals: [250, 500, 1_000],
    })
    .toBe(true);
}

async function gotoCurrentOriginPath(page: Page, pathname: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}${pathname}`);
}

test.describe("Product Images Flow", () => {
  test("admin can upload image and storefront displays it", async ({ page }) => {
    const timestamp = Date.now();
    const productTitle = `Test Product with Image ${timestamp}`;
    const sku = `IMG-${timestamp}`;

    await loginAsAdmin(page);

    await gotoCurrentOriginPath(page, "/admin/products/new");

    await expect(page.locator("h1")).toContainText("Novo Produto");

    await page.fill('input[id="title"]', productTitle);
    await page.fill('textarea[id="description"]', "Test product with image");
    await page.fill('input[id="variants.0.sku"]', sku);
    await page.fill('input[id="variants.0.priceCents"]', "5990");
    await page.fill('input[id="variants.0.stock"]', "100");

    await page
      .locator('button[type="submit"], button:has-text("Criar produto"), button:has-text("Salvar alterações")')
      .first()
      .click({ noWaitAfter: true });

    await page.waitForURL(
      (url) => url.pathname.startsWith("/admin/products/") && !url.pathname.endsWith("/new") && url.pathname !== "/admin/products",
      { timeout: 15_000 }
    );

    await expect(page.getByRole('button', { name: 'Adicionar', exact: true })).toBeVisible({ timeout: 10_000 });

    const fixturePath = path.resolve(__dirname, "fixtures", "test-product.png");
    await page.locator('input[type="file"]').setInputFiles(fixturePath);

    await expect(page.locator('img[alt="Imagem 1"]')).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('text=Principal')).toBeVisible();

    await gotoCurrentOriginPath(page, "/");

    await expect(page.locator("h1")).toContainText("Products", { timeout: 15000 });

    const productCard = page.locator(`article:has-text("${productTitle}")`);

    const productImage = productCard.locator('div.relative img');
    await expect(productImage).toBeVisible();

    await productImage.click();

    await page.waitForURL((url) => url.pathname.startsWith("/products/"), { timeout: 10_000 });

    const carouselMainImage = page.locator('img[alt^="Imagem "]').first();
    await expect(carouselMainImage).toBeVisible();

    await expect(page.locator(`h1:has-text("${productTitle}")`)).toBeVisible();
  });
});
