import { test, expect, type Page, type Response } from "@playwright/test";
import path from "path";

const ADMIN_EMAIL = "dev-admin";
const ADMIN_PASSWORD = "dev-admin";

function isKeycloakAuthUrl(url: string): boolean {
  return url.includes("/protocol/openid-connect/auth") || url.includes("keycloak");
}

async function getUnauthDestination(page: Page): Promise<"nextauth" | "keycloak"> {
  const nextAuthButton = page.getByRole("button", { name: "Sign in with Keycloak" });

  // Try to detect Keycloak auth URL first using expect.poll for non-arbitrary waits
  try {
    await expect
      .poll(
        async () => isKeycloakAuthUrl(page.url()),
        { timeout: 15_000, intervals: [200, 500, 1_000] }
      )
      .toBe(true);
    return "keycloak";
  } catch {
    // Not on Keycloak URL, check for NextAuth sign-in button
  }

  try {
    await expect(nextAuthButton).toBeVisible({ timeout: 15_000 });
    return "nextauth";
  } catch {
    // Fall through to timeout error
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

/**
 * Asserts that an image element is fully loaded (decoded, not broken).
 * Prevents false positives from `toBeVisible()` alone — a broken <img> can be visible
 * while returning empty content. This helper verifies:
 *   1. Element is attached/visible
 *   2. HTMLImageElement.complete === true
 *   3. naturalWidth > 0 (proves the browser actually decoded pixels)
 *
 * Uses `expect.poll` for deterministic, non-arbitrary waits on decode state.
 */
async function expectImageLoaded(locator: ReturnType<Page["locator"]>): Promise<void> {
  await expect(locator).toBeVisible();

  await expect
    .poll(
      async () =>
        locator.evaluate(
          (el: HTMLImageElement) => el.complete && el.naturalWidth > 0
        ),
      { timeout: 20_000, intervals: [250, 500, 1_000] }
    )
    .toBe(true);
}

test.describe("Product Images Flow", () => {
  test.setTimeout(180_000);

  test("admin can upload image and storefront displays it", async ({ page }) => {
    const timestamp = Date.now();
    const productTitle = `Test Product with Image ${timestamp}`;
    const sku = `IMG-${timestamp}`;

    await loginAsAdmin(page);

    await gotoCurrentOriginPath(page, "/admin/products/new");

    await expect(page.locator("h1")).toContainText("Novo Produto");

    await page.locator('input[id="title"]').pressSequentially(productTitle);
    await page.locator('textarea[id="description"]').pressSequentially("Test product with image");
    await page.locator('input[id="variants.0.sku"]').pressSequentially(sku);
    await page.locator('input[id="variants.0.priceCents"]').pressSequentially("5990");
    await page.locator('input[id="variants.0.stock"]').pressSequentially("100");

    const isAdminProductsResponse = (res: Response) =>
      res.url().includes("/api/admin/products") && res.request().method() === "POST";

    if (!(await hasSessionAccessToken(page))) {
      await loginAsAdmin(page);
      await gotoCurrentOriginPath(page, "/admin/products/new");
      await expect(page.locator("h1")).toContainText("Novo Produto");
      await page.locator('input[id="title"]').pressSequentially(productTitle);
      await page.locator('textarea[id="description"]').pressSequentially("Test product with image");
      await page.locator('input[id="variants.0.sku"]').pressSequentially(sku);
      await page.locator('input[id="variants.0.priceCents"]').pressSequentially("5990");
      await page.locator('input[id="variants.0.stock"]').pressSequentially("100");
    }

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });

    let response: Response;
    try {
      [response] = await Promise.all([
        page.waitForResponse(isAdminProductsResponse, { timeout: 60_000 }),
        submitBtn.click(),
      ]);
    } catch {
      [response] = await Promise.all([
        page.waitForResponse(isAdminProductsResponse, { timeout: 60_000 }),
        page.evaluate(() => {
          const form = document.querySelector("form");
          if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }),
      ]);
    }

    if (!response.ok()) {
      const body = await response.text().catch(() => "(no body)");
      throw new Error(`Product creation failed (${response.status()}): ${body}`);
    }

    const createdProduct = (await response.json()) as { id: string };
    await gotoCurrentOriginPath(page, `/admin/products/${createdProduct.id}`);

    await expect(page.getByRole("button", { name: "Adicionar", exact: true })).toBeVisible({ timeout: 10_000 });

    const fixturePath = path.resolve(__dirname, "fixtures", "test-product.png");

    const uploadPath = `/api/admin/products/${createdProduct.id}/images/upload`;

    let uploadResponse: Response | null = null;
    const responsePromise = new Promise<Response>((resolve) => {
      page.on("response", function onResponse(res) {
        if (res.request().method() === "POST" && res.url().includes(uploadPath)) {
          page.off("response", onResponse);
          resolve(res);
        }
      });
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Image upload timed out after 60s: ${uploadPath}`)), 60_000)
    );

    await page.locator("input[type='file']").first().setInputFiles(fixturePath);

    try {
      uploadResponse = await Promise.race([responsePromise, timeoutPromise]);
    } catch (err) {
      throw new Error(
        `Image upload response timed out after 60s for endpoint ${uploadPath}: ${err}`
      );
    }

    if (!uploadResponse.ok()) {
      const body = await uploadResponse.text().catch(() => "(no body)");
      throw new Error(`Image upload failed (${uploadResponse.status()}): ${body}`);
    }

    await expect(page.locator("text=Carregando...")).toBeHidden({ timeout: 60_000 });

    await expectImageLoaded(page.locator('img[alt="Imagem 1"]'));

    await expect(page.locator('text=Principal')).toBeVisible();

    await gotoCurrentOriginPath(page, "/");

    await expect(page.locator("h1")).toContainText("Products", { timeout: 15000 });

    const productCard = page.locator(`article:has-text("${productTitle}")`);

    const productImage = productCard.locator('div.relative img');
    await expectImageLoaded(productImage);

    await productImage.click();

    await page.waitForURL((url) => url.pathname.startsWith("/products/"), { timeout: 10_000 });

    const carouselMainImage = page.locator('img[alt^="Imagem "]').first();
    await expectImageLoaded(carouselMainImage);

    await expect(page.locator(`h1:has-text("${productTitle}")`)).toBeVisible();
  });
});
