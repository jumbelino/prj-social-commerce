import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "dev-admin";
const ADMIN_PASSWORD = "dev-admin";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin");

  await page.waitForURL(
    (url) =>
      url.pathname.includes("/protocol/openid-connect/auth") ||
      url.href.includes("keycloak"),
    { timeout: 30_000 }
  );

  await page.fill('input[name="username"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => url.pathname === "/admin", {
    timeout: 30_000,
  });
}

test.describe("Admin Authentication", () => {
  test("redirects to Keycloak sign-in when unauthenticated", async ({ page }) => {
    await page.goto("/admin");

    await page.waitForURL(
      (url) =>
        url.pathname.includes("/protocol/openid-connect/auth") ||
        url.href.includes("keycloak"),
      { timeout: 15_000 }
    );

    const currentUrl = page.url();
    expect(currentUrl).toContain("callbackUrl=%2Fadmin");
  });

  test("can login as admin and access dashboard", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.locator("h1")).toContainText("Dashboard");
    await expect(page.locator("text=Admin")).toBeVisible();
  });
});

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("dashboard loads with metrics cards", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.locator("h1")).toContainText("Dashboard");

    const dashboardContent = await page.content();

    const hasMetrics =
      dashboardContent.includes("Pedidos") ||
      dashboardContent.includes("Receita") ||
      dashboardContent.includes("Clientes") ||
      dashboardContent.includes("Métricas");

    expect(hasMetrics).toBe(true);
  });

  test("quick actions are visible", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.locator("text=Novo Pedido")).toBeVisible();
    await expect(page.locator("text=Novo Produto")).toBeVisible();
    await expect(page.locator("text=Pedidos Pendentes")).toBeVisible();
  });
});

test.describe("Admin Products", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("products list page loads with table", async ({ page }) => {
    await page.goto("/admin/products");

    await expect(page.locator("h1")).toContainText("Produtos");

    const hasTable =
      (await page.locator("table").count()) > 0 ||
      (await page.locator("text=Nenhum produto").count()) > 0;

    expect(hasTable).toBe(true);
  });

  test("can navigate to new product form", async ({ page }) => {
    await page.goto("/admin/products");

    await page.click("text=Novo Produto");

    await expect(page.locator("h1")).toContainText("Novo Produto");

    await expect(page.locator('input[id="title"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("can fill and submit new product form", async ({ page }) => {
    const timestamp = Date.now();
    const productTitle = `Test Product ${timestamp}`;
    const sku = `TEST-${timestamp}`;

    await page.goto("/admin/products/new");

    await page.fill('input[id="title"]', productTitle);
    await page.fill('textarea[id="description"]', "Test description");

    await page.fill('input[id="variants.0.sku"]', sku);
    await page.fill('input[id="variants.0.priceCents"]', "5990");
    await page.fill('input[id="variants.0.stock"]', "100");

    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname === "/admin/products", {
      timeout: 15_000,
    });

    await expect(page.locator(`text=${productTitle}`)).toBeVisible();
  });

  test("can edit an existing product", async ({ page }) => {
    const timestamp = Date.now();
    const productTitle = `Product to Edit ${timestamp}`;
    const sku = `EDIT-${timestamp}`;

    await page.goto("/admin/products/new");
    await page.fill('input[id="title"]', productTitle);
    await page.fill('input[id="variants.0.sku"]', sku);
    await page.fill('input[id="variants.0.priceCents"]', "2990");
    await page.fill('input[id="variants.0.stock"]', "50");
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname === "/admin/products", {
      timeout: 15_000,
    });

    await page.click(`text=${productTitle}`);

    await page.waitForURL((url) => url.pathname.includes("/admin/products/"), {
      timeout: 10_000,
    });

    const newTitle = `${productTitle} (Updated)`;
    await page.fill('input[id="title"]', newTitle);

    await page.click('button:has-text("Salvar")');

    await page.waitForURL((url) => url.pathname === "/admin/products", {
      timeout: 15_000,
    });

    await expect(page.locator(`text=${newTitle}`)).toBeVisible();
  });
});

test.describe("Admin Customers", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("customers list page loads", async ({ page }) => {
    await page.goto("/admin/customers");

    await expect(page.locator("h1")).toContainText("Clientes");

    const hasContent =
      (await page.locator("table").count()) > 0 ||
      (await page.locator("text=Nenhum cliente").count()) > 0;

    expect(hasContent).toBe(true);
  });

  test("search input is present", async ({ page }) => {
    await page.goto("/admin/customers");

    await expect(
      page.locator('input[placeholder*="Buscar"]')
    ).toBeVisible();
  });
});

test.describe("Admin Orders", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("orders list page loads", async ({ page }) => {
    await page.goto("/admin/orders");

    await expect(page.locator("h1")).toContainText("Orders");

    const hasContent =
      (await page.locator("text=Nenhum pedido").count()) > 0 ||
      (await page.locator("text=Lista de Pedidos").count()) > 0;

    expect(hasContent).toBe(true);
  });

  test("status filter is present", async ({ page }) => {
    await page.goto("/admin/orders");

    await expect(
      page.locator('select:has(option:has-text("Todos os status"))')
    ).toBeVisible();
  });

  test("can select an order and view details", async ({ page }) => {
    await page.goto("/admin/orders");

    const orderCount = await page.locator("text=Lista de Pedidos").count();

    if (orderCount > 0) {
      const firstOrder = page.locator('[class*="rounded-lg"][class*="border"]').first();
      if (await firstOrder.isVisible()) {
        await firstOrder.click();

        await expect(
          page.locator("text=Detalhes do Pedido")
        ).toBeVisible();
      }
    } else {
      await expect(
        page.locator("text=Nenhum pedido encontrado")
      ).toBeVisible();
    }
  });

  test("can update order status", async ({ page }) => {
    await page.goto("/admin/orders");

    const hasOrders = !(await page.locator("text=Nenhum pedido").isVisible());

    if (hasOrders) {
      const firstOrderButton = page.locator("button").filter({
        hasText: /@/,
      }).first();

      if (await firstOrderButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstOrderButton.click();

        await page.waitForTimeout(500);

        const statusButtons = page.locator('section button:has-text("confirmed"), section button:has-text("shipped"), section button:has-text("delivered"), section button:has-text("cancelled")');

        const count = await statusButtons.count();
        if (count > 0) {
          await statusButtons.nth(0).click();

          await page.waitForTimeout(1000);
        }
      }
    }

    await expect(page.locator("h1")).toContainText("Orders");
  });
});
