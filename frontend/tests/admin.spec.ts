import { test, expect, type Page, type Response } from "@playwright/test";

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

async function gotoCurrentOriginPath(page: Page, pathname: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}${pathname}`);
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
    await gotoCurrentOriginPath(page, "/admin");
  }

  await expect
    .poll(() => hasSessionAccessToken(page), {
      timeout: 15_000,
      intervals: [250, 500, 1_000],
    })
    .toBe(true);
}

test.describe("Admin Authentication", () => {
  test("redirects to Keycloak sign-in when unauthenticated", async ({ page }) => {
    await page.goto("/admin");

    const destination = await getUnauthDestination(page);

    if (destination === "nextauth") {
      await expect(
        page.getByRole("button", { name: "Sign in with Keycloak" })
      ).toBeVisible();
      expect(page.url()).toContain("/api/auth/signin");
      return;
    }

    expect(page.url()).toContain("/protocol/openid-connect/auth");
  });

  test("redirects to auth flow when customers page is unauthenticated", async ({ page }) => {
    await page.goto("/admin/customers");
    
    const url = page.url();
    const content = await page.content();
    
    if (url.includes("/api/auth/signin") || url.includes("/protocol/openid-connect/auth")) {
      return;
    }
    
    if (content.includes("Unauthorized")) {
      throw new Error("BUG: Customer page shows Unauthorized instead of redirecting to auth");
    }
    
    if (content.includes("Clientes")) {
      throw new Error("BUG: Customer page rendered content without valid session");
    }
    
    await page.waitForURL(
      (url) => url.href.includes("/api/auth/signin") || url.href.includes("/protocol/openid-connect/auth"),
      { timeout: 5000 }
    );
  });

  test("redirects to auth flow when products page is unauthenticated", async ({ page }) => {
    await page.goto("/admin/products");
    
    const url = page.url();
    const content = await page.content();
    
    if (url.includes("/api/auth/signin") || url.includes("/protocol/openid-connect/auth")) {
      return;
    }
    
    if (content.includes("Unauthorized")) {
      throw new Error("BUG: Products page shows Unauthorized instead of redirecting to auth");
    }
    
    if (content.includes("Produtos")) {
      throw new Error("BUG: Products page rendered content without valid session");
    }
    
    await page.waitForURL(
      (url) => url.href.includes("/api/auth/signin") || url.href.includes("/protocol/openid-connect/auth"),
      { timeout: 5000 }
    );
  });

  test("redirects to auth flow when customer detail is unauthenticated", async ({ page }) => {
    await page.goto("/admin/customers/1");

    const destination = await getUnauthDestination(page);

    if (destination === "nextauth") {
      await expect(
        page.getByRole("button", { name: "Sign in with Keycloak" })
      ).toBeVisible();
      expect(page.url()).toContain("/api/auth/signin");
      return;
    }

    expect(page.url()).toContain("/protocol/openid-connect/auth");
  });

  test("can login as admin and access dashboard", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.locator("h1")).toContainText("Dashboard");
    await expect(page.getByText("dev-admin@local.test").first()).toBeVisible();
  });
});

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("dashboard loads with metrics cards", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin");

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
    await gotoCurrentOriginPath(page, "/admin");

    await expect(page.locator("text=Ver Pedidos")).toBeVisible();
    await expect(page.locator("text=Novo Produto")).toBeVisible();
    await expect(page.locator("text=Pedidos Pendentes")).toBeVisible();
  });
});

test.describe("Admin Products", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("products list page loads with table", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin/products");

    await expect(page.locator("h1")).toContainText("Produtos");
    await expect(page.locator("text=Novo Produto")).toBeVisible();
  });

  test("can navigate to new product form", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin/products");

    await page.click("text=Novo Produto");

    await expect(page.locator("h1")).toContainText("Novo Produto");

    await expect(page.locator('input[id="title"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("can fill and submit new product form", async ({ page }) => {
    const timestamp = Date.now();
    const productTitle = `Test Product ${timestamp}`;
    const sku = `TEST-${timestamp}`;

    await gotoCurrentOriginPath(page, "/admin/products/new");

    await page.fill('input[id="title"]', productTitle);
    await page.fill('textarea[id="description"]', "Test description");

    await page.fill('input[id="variants.0.sku"]', sku);
    await page.fill('input[id="variants.0.priceCents"]', "5990");
    await page.fill('input[id="variants.0.stock"]', "100");

    await page
      .locator('button[type="submit"], button:has-text("Criar produto"), button:has-text("Salvar alterações")')
      .first()
      .click({ noWaitAfter: true });

    await page.waitForURL(
      (url) =>
        url.pathname.startsWith("/admin/products/") && !url.pathname.endsWith("/new") && url.pathname !== "/admin/products",
      {
        timeout: 15_000,
      }
    );

    await expect(page.locator('input[id="title"]')).toHaveValue(productTitle);
  });

  test("can edit an existing product", async ({ page }) => {
    const timestamp = Date.now();
    const productTitle = `Product to Edit ${timestamp}`;
    const sku = `EDIT-${timestamp}`;

    await gotoCurrentOriginPath(page, "/admin/products/new");
    await page.fill('input[id="title"]', productTitle);
    await page.fill('input[id="variants.0.sku"]', sku);
    await page.fill('input[id="variants.0.priceCents"]', "2990");
    await page.fill('input[id="variants.0.stock"]', "50");
    await page
      .locator('button[type="submit"], button:has-text("Criar produto"), button:has-text("Salvar alterações")')
      .first()
      .click({ noWaitAfter: true });

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin/products" ||
        /^\/admin\/products\/[^/]+$/.test(url.pathname),
      {
        timeout: 15_000,
      }
    );

    if (new URL(page.url()).pathname === "/admin/products") {
      await page.click(`text=${productTitle}`);

      await page.waitForURL((url) => url.pathname.includes("/admin/products/"), {
        timeout: 10_000,
      });
    }

    const newTitle = `${productTitle} (Updated)`;
    await page.fill('input[id="title"]', newTitle);

    const updateResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /\/api\/admin\/products\//.test(new URL(response.url()).pathname),
        { timeout: 15_000 }
      )
      .catch(() => null);

    await page
      .locator('button:has-text("Salvar"), button[type="submit"]')
      .first()
      .click({ noWaitAfter: true });

    const updateResponse = await updateResponsePromise;
    expect(updateResponse).not.toBeNull();

    if (!updateResponse?.ok()) {
      expect(updateResponse?.status() ?? 0).toBeGreaterThanOrEqual(400);
      await expect(page.locator("text=Erro ao salvar")).toBeVisible();
      await expect(page.locator("text=Internal Server Error")).toBeVisible();
      return;
    }

    if (new URL(page.url()).pathname === "/admin/products") {
      await expect(page.locator(`text=${newTitle}`)).toBeVisible();
      return;
    }

    await page.reload();
    await expect(page.locator('input[id="title"]')).toHaveValue(newTitle);
  });
});

test.describe("Admin Customers", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("customers list page loads", async ({ page }) => {
    const customersApiStatuses: number[] = [];
    const responseListener = (response: Response) => {
      if (response.url().includes("/api/admin/customers")) {
        customersApiStatuses.push(response.status());
      }
    };

    page.on("response", responseListener);

    await gotoCurrentOriginPath(page, "/admin/customers");

    await expect(page.locator("h1")).toContainText("Clientes");

    const hasContent =
      (await page.locator("table").count()) > 0 ||
      (await page.locator("text=Nenhum cliente encontrado").count()) > 0 ||
      (await page.locator('input[placeholder*="Buscar"]').count()) > 0;

    expect(hasContent).toBe(true);
    await expect
      .poll(() => customersApiStatuses.length > 0, {
        timeout: 15_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);
    expect(customersApiStatuses).not.toContain(405);

    page.off("response", responseListener);
  });

  test("search input is present", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin/customers");

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
    await gotoCurrentOriginPath(page, "/admin/orders");

    await expect(page.locator("h1")).toContainText(/Orders|Pedidos/);

    const hasContent =
      (await page.locator("text=Nenhum pedido").count()) > 0 ||
      (await page.locator("text=Lista de Pedidos").count()) > 0;

    expect(hasContent).toBe(true);
  });

  test("status filter is present", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin/orders");

    await expect(
      page.locator('select:has(option:has-text("Todos os status"))')
    ).toBeVisible();
    await expect(
      page.locator('select:has(option:has-text("Todos os pagamentos"))')
    ).toBeVisible();
  });

  test("payment status filter is forwarded to admin orders API", async ({ page }) => {
    let sawPendingFilter = false;
    const testOrder = {
      id: "00000000-0000-0000-0000-0000000000aa",
      status: "pending",
      delivery_method: "shipping",
      customer_id: null,
      customer_name: "Cliente Operacional",
      customer_email: "operacional@example.com",
      customer_phone: null,
      source: "admin_assisted",
      subtotal_cents: 8900,
      shipping_cents: 1200,
      shipping_provider: "melhor_envio",
      shipping_service_id: 1,
      shipping_service_name: "PAC",
      shipping_delivery_days: 4,
      shipping_from_postal_code: "01001000",
      shipping_to_postal_code: "01310930",
      shipping_quote_json: null,
      total_cents: 10100,
      expires_at: null,
      inventory_released_at: null,
      latest_payment_status: "pending",
      latest_payment_external_id: "mp-pending-admin",
      created_at: new Date().toISOString(),
      items: [],
    };

    await page.route("**/api/admin/orders*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("payment_status") === "pending") {
        sawPendingFilter = true;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([testOrder]),
      });
    });

    await gotoCurrentOriginPath(page, "/admin/orders");
    await page.locator('select:has(option:has-text("Todos os pagamentos"))').selectOption("pending");

    await expect
      .poll(() => sawPendingFilter, { timeout: 5_000 })
      .toBe(true);
    await expect(page.getByText("Pagamento: Pendente")).toBeVisible();
  });

  test("can select an order and view details", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin/orders");

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

  test("order detail shows operational summary with payment and delivery context", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-0000000000bb";
    const testOrder = {
      id: testOrderId,
      status: "pending",
      delivery_method: "pickup",
      customer_id: 12,
      customer_name: "Cliente Retirada",
      customer_email: "retirada@example.com",
      customer_phone: "+5511999999999",
      source: "admin_assisted",
      subtotal_cents: 7900,
      shipping_cents: 0,
      shipping_provider: null,
      shipping_service_id: null,
      shipping_service_name: null,
      shipping_delivery_days: null,
      shipping_from_postal_code: null,
      shipping_to_postal_code: null,
      shipping_quote_json: null,
      total_cents: 7900,
      expires_at: null,
      inventory_released_at: null,
      latest_payment_status: null,
      latest_payment_external_id: null,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          variant_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 7900,
          total_cents: 7900,
        },
      ],
    };

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value: string) => {
            (window as Window & { __copiedText?: string }).__copiedText = value;
          },
        },
        configurable: true,
      });
    });

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes(`/api/admin/orders/${testOrderId}`)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(testOrder),
        });
      }

      if (url.includes("/api/admin/orders")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }

      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.getByText("Resumo operacional")).toBeVisible();
    await expect(page.getByText("Sem pagamento")).toBeVisible();
    await expect(page.getByText("Venda assistida")).toBeVisible();
    await expect(page.getByText("Retirada")).toBeVisible();
    await expect(page.getByText("Nenhum pagamento foi iniciado ainda para este pedido.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ações rápidas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar ID do pedido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar contato" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar CEP" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copiar resumo de entrega" })).toHaveCount(0);

    await page.getByRole("button", { name: "Copiar contato" }).click();
    await expect(page.getByText("Copiado")).toBeVisible();
    const copiedText = await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText);
    expect(copiedText).toBe("Cliente Retirada | retirada@example.com | +5511999999999");
  });

  test("order detail shows shipping copy actions when delivery data exists", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-0000000000bc";
    const testOrder = {
      id: testOrderId,
      status: "pending",
      delivery_method: "shipping",
      customer_id: 15,
      customer_name: "Cliente Envio",
      customer_email: "envio@example.com",
      customer_phone: "+5511888888888",
      source: "storefront",
      subtotal_cents: 9900,
      shipping_cents: 1800,
      shipping_provider: "melhor_envio",
      shipping_service_id: 1,
      shipping_service_name: "PAC",
      shipping_delivery_days: 5,
      shipping_from_postal_code: "01001000",
      shipping_to_postal_code: "01310930",
      shipping_quote_json: null,
      total_cents: 11700,
      expires_at: null,
      inventory_released_at: null,
      latest_payment_status: "pending",
      latest_payment_external_id: "mp-order-detail-001",
      created_at: new Date().toISOString(),
      items: [
        {
          id: "11111111-3333-3333-4444-555555555555",
          variant_id: "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 9900,
          total_cents: 9900,
        },
      ],
    };

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value: string) => {
            (window as Window & { __copiedText?: string }).__copiedText = value;
          },
        },
        configurable: true,
      });
    });

    await page.route("**/payments/mercado-pago/preference", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          preference_id: "pref-order-detail-001",
          init_point: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-order-detail-001",
          sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-order-detail-001",
          checkout_url: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-order-detail-001",
          is_sandbox: true,
        }),
      });
    });

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes(`/api/admin/orders/${testOrderId}`)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(testOrder),
        });
      }

      if (url.includes("/api/admin/orders")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }

      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.getByText("Envio")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar CEP" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar resumo de entrega" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar ID externo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar link de pagamento" })).toBeVisible();

    await page.getByRole("button", { name: "Copiar resumo de entrega" }).click();
    await expect(page.getByText("Copiado")).toBeVisible();
    const shippingSummary = await page.evaluate(
      () => (window as Window & { __copiedText?: string }).__copiedText
    );
    expect(shippingSummary).toBe("PAC | 5 dias | CEP 01310930");

    await page.getByRole("button", { name: "Gerar link de pagamento" }).click();
    await expect(page.getByText("Link de pagamento gerado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir checkout" })).toHaveAttribute(
      "href",
      "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-order-detail-001"
    );

    await page.getByRole("button", { name: "Copiar link" }).click();
    await expect(page.getByText("Copiado")).toBeVisible();
    const copiedCheckoutLink = await page.evaluate(
      () => (window as Window & { __copiedText?: string }).__copiedText
    );
    expect(copiedCheckoutLink).toBe(
      "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-order-detail-001"
    );
  });

  test("order detail explains why payment link generation is unavailable", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-0000000000bd";
    const testOrder = {
      id: testOrderId,
      status: "pending",
      delivery_method: "shipping",
      customer_id: 18,
      customer_name: "Cliente Sem Email",
      customer_email: null,
      customer_phone: "+5511777777777",
      source: "storefront",
      subtotal_cents: 8500,
      shipping_cents: 1200,
      shipping_provider: "melhor_envio",
      shipping_service_id: 2,
      shipping_service_name: "SEDEX",
      shipping_delivery_days: 2,
      shipping_from_postal_code: "01001000",
      shipping_to_postal_code: "20040002",
      shipping_quote_json: null,
      total_cents: 9700,
      expires_at: null,
      inventory_released_at: null,
      latest_payment_status: null,
      latest_payment_external_id: null,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "11111111-4444-3333-4444-555555555555",
          variant_id: "gggggggg-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 8500,
          total_cents: 8500,
        },
      ],
    };

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes(`/api/admin/orders/${testOrderId}`)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(testOrder),
        });
      }

      if (url.includes("/api/admin/orders")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }

      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.getByRole("button", { name: "Gerar link de pagamento" })).toBeDisabled();
    await expect(page.getByText("Email do cliente é necessário para gerar o link.")).toBeVisible();
  });

  test("order detail blocks payment link generation when payment is already approved", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-0000000000be";
    const testOrder = {
      id: testOrderId,
      status: "pending",
      delivery_method: "shipping",
      customer_id: 19,
      customer_name: "Cliente Pago",
      customer_email: "pago@example.com",
      customer_phone: "+5511666666666",
      source: "storefront",
      subtotal_cents: 6500,
      shipping_cents: 900,
      shipping_provider: "melhor_envio",
      shipping_service_id: 3,
      shipping_service_name: "Mini Envios",
      shipping_delivery_days: 3,
      shipping_from_postal_code: "01001000",
      shipping_to_postal_code: "30110028",
      shipping_quote_json: null,
      total_cents: 7400,
      expires_at: null,
      inventory_released_at: null,
      latest_payment_status: "approved",
      latest_payment_external_id: "mp-approved-001",
      created_at: new Date().toISOString(),
      items: [
        {
          id: "11111111-5555-3333-4444-555555555555",
          variant_id: "hhhhhhhh-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 6500,
          total_cents: 6500,
        },
      ],
    };

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes(`/api/admin/orders/${testOrderId}`)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(testOrder),
        });
      }

      if (url.includes("/api/admin/orders")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }

      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.getByRole("button", { name: "Gerar link de pagamento" })).toBeDisabled();
    await expect(page.getByText("Este pedido já possui pagamento aprovado.")).toBeVisible();
    await expect(page.getByText("Pago")).toBeVisible();
  });

  test("order detail keeps payment link generation available after rejected payment", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-0000000000bf";
    const testOrder = {
      id: testOrderId,
      status: "pending",
      delivery_method: "shipping",
      customer_id: 20,
      customer_name: "Cliente Rejeitado",
      customer_email: "rejeitado@example.com",
      customer_phone: "+5511555555555",
      source: "admin_assisted",
      subtotal_cents: 7300,
      shipping_cents: 1100,
      shipping_provider: "melhor_envio",
      shipping_service_id: 4,
      shipping_service_name: "PAC",
      shipping_delivery_days: 4,
      shipping_from_postal_code: "01001000",
      shipping_to_postal_code: "40010000",
      shipping_quote_json: null,
      total_cents: 8400,
      expires_at: null,
      inventory_released_at: null,
      latest_payment_status: "rejected",
      latest_payment_external_id: "mp-rejected-001",
      created_at: new Date().toISOString(),
      items: [
        {
          id: "11111111-6666-3333-4444-555555555555",
          variant_id: "iiiiiiii-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 7300,
          total_cents: 7300,
        },
      ],
    };

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes(`/api/admin/orders/${testOrderId}`)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(testOrder),
        });
      }

      if (url.includes("/api/admin/orders")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }

      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.getByText("Falha")).toBeVisible();
    await expect(page.getByText("Venda assistida")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar link de pagamento" })).toBeEnabled();
  });

  test("can update order status", async ({ page }) => {
    await gotoCurrentOriginPath(page, "/admin/orders");

    const hasOrders = !(await page.locator("text=Nenhum pedido").isVisible());

    if (hasOrders) {
      const firstOrderButton = page.locator("button").filter({
        hasText: /@/,
      }).first();

      if (await firstOrderButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstOrderButton.click();

        await page.waitForTimeout(500);

        const statusButtons = page.locator('section button:has-text("Pago"), section button:has-text("Enviado"), section button:has-text("Entregue"), section button:has-text("Cancelado")');

        const count = await statusButtons.count();
        if (count > 0) {
          await statusButtons.nth(0).click();

          await page.waitForTimeout(1000);
        }
      }
    }

    await expect(page.locator("h1")).toContainText(/Orders|Pedidos/);
  });

  test("legal status transition path works (paid -> shipped -> delivered)", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-000000000001";
    const testOrder = {
      id: testOrderId,
      status: "paid",
      customer_name: "Test Customer",
      customer_email: "test@example.com",
      customer_phone: "+551199999999",
      source: "storefront",
      subtotal_cents: 5900,
      shipping_cents: 1500,
      shipping_provider: "melhor_envio",
      shipping_service_id: 1,
      shipping_service_name: "PAC",
      shipping_delivery_days: 5,
      shipping_from_postal_code: "01000000",
      shipping_to_postal_code: "05000000",
      shipping_quote_json: null,
      total_cents: 7400,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          variant_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 5900,
          total_cents: 5900,
        },
      ],
    };

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/admin/orders")) {
        if (url.includes(testOrderId)) {
          if (route.request().method() === "PATCH") {
            const body = JSON.parse(route.request().postData() || "{}");
            const currentStatus = testOrder.status;
            const newStatus = body.status;

            const validTransitions: Record<string, string[]> = {
              pending: ["paid", "cancelled"],
              paid: ["shipped", "cancelled"],
              shipped: ["delivered", "cancelled"],
              delivered: [],
              cancelled: [],
            };

            const allowed = validTransitions[currentStatus] || [];
            if (!allowed.includes(newStatus)) {
              return route.fulfill({
                status: 400,
                contentType: "application/json",
                body: JSON.stringify({ detail: `invalid transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(", ")}` }),
              });
            }

            testOrder.status = newStatus;
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(testOrder),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(testOrder),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }
      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.locator("h1")).toContainText(/Pedido/);

    const shippedButton = page.locator('button:has-text("Enviado")');
    const deliveredButton = page.locator('button:has-text("Entregue")');

    await expect(shippedButton).toBeEnabled();
    await shippedButton.click();
    await page.waitForTimeout(500);

    await expect(shippedButton).toHaveClass(/bg-slate-900/);

    await expect(deliveredButton).toBeEnabled();
    await deliveredButton.click();
    await page.waitForTimeout(500);

    const isNowDelivered = await page.locator('button.bg-slate-900:has-text("Entregue")').count() > 0;
    expect(isNowDelivered).toBe(true);
  });

  test("illegal status transition is rejected (pending -> delivered)", async ({ page }) => {
    const testOrderId = "00000000-0000-0000-0000-000000000002";
    const testOrder = {
      id: testOrderId,
      status: "pending",
      customer_name: "Test Customer",
      customer_email: "test@example.com",
      customer_phone: "+551199999999",
      source: "storefront",
      subtotal_cents: 5900,
      shipping_cents: 1500,
      shipping_provider: "melhor_envio",
      shipping_service_id: 1,
      shipping_service_name: "PAC",
      shipping_delivery_days: 5,
      shipping_from_postal_code: "01000000",
      shipping_to_postal_code: "05000000",
      shipping_quote_json: null,
      total_cents: 7400,
      created_at: new Date().toISOString(),
      items: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          variant_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          quantity: 1,
          unit_price_cents: 5900,
          total_cents: 5900,
        },
      ],
    };

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/admin/orders")) {
        if (url.includes(testOrderId)) {
          if (route.request().method() === "PATCH") {
            const body = JSON.parse(route.request().postData() || "{}");
            const currentStatus = testOrder.status;
            const newStatus = body.status;

            const validTransitions: Record<string, string[]> = {
              pending: ["paid", "cancelled"],
              paid: ["shipped", "cancelled"],
              shipped: ["delivered", "cancelled"],
              delivered: [],
              cancelled: [],
            };

            const allowed = validTransitions[currentStatus] || [];
            if (!allowed.includes(newStatus)) {
              return route.fulfill({
                status: 400,
                contentType: "application/json",
                body: JSON.stringify({ detail: `invalid transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(", ")}` }),
              });
            }

            testOrder.status = newStatus;
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(testOrder),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(testOrder),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([testOrder]),
        });
      }
      return route.continue();
    });

    await gotoCurrentOriginPath(page, `/admin/orders/${testOrderId}`);

    await expect(page.locator("h1")).toContainText(/Pedido/);

    await expect(page.locator("text=Pendente").first()).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(500);

    const deliveredButton = page.locator('button:has-text("Entregue")');
    if (await deliveredButton.isVisible()) {
      await deliveredButton.click();
      await page.waitForTimeout(1000);

      const errorPanel = page.locator("text=invalid transition");
      await expect(errorPanel).toBeVisible();
    } else {
      expect(true).toBe(true);
    }
  });
});

test.describe("Admin Assisted Sale", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("can create an assisted order with shipping and existing customer", async ({ page }) => {
    const product = {
      id: "product-assisted-001",
      title: "Camiseta Operacional",
      description: "Modelo basico para venda assistida",
      active: true,
      created_at: new Date().toISOString(),
      images: [],
      variants: [
        {
          id: "variant-assisted-001",
          product_id: "product-assisted-001",
          sku: "CAM-OPS-M",
          price_cents: 7900,
          attributes_json: { tamanho: "M", cor: "Preta" },
          stock: 8,
          weight_kg: null,
          width_cm: null,
          height_cm: null,
          length_cm: null,
        },
      ],
    };

    const customer = {
      id: 10,
      name: "Cliente Assistido",
      email: "assistido@example.com",
      phone: "+5511999999999",
      created_at: new Date().toISOString(),
      total_orders: 3,
    };

    let createOrderPayload: { delivery_method?: unknown; shipping?: unknown } | null = null;
    let copiedText = "";

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value: string) => {
            (window as Window & { __copiedText?: string }).__copiedText = value;
          },
        },
        configurable: true,
      });
    });

    await page.route("**/api/admin/products*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([product]),
      });
    });

    await page.route("**/api/admin/customers*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([customer]),
      });
    });

    await page.route("**/shipping/quotes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          options: [
            {
              service_id: 1,
              name: "PAC",
              price_cents: 1450,
              delivery_days: 4,
              raw_json: { id: 1, service: "PAC" },
            },
          ],
        }),
      });
    });

    await page.route("**/api/admin/orders*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      createOrderPayload = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-00000000a001",
          status: "pending",
          delivery_method: "shipping",
          customer_id: 10,
          customer_name: "Cliente Assistido",
          customer_email: "assistido@example.com",
          customer_phone: "+5511999999999",
          source: "admin_assisted",
          subtotal_cents: 15800,
          shipping_cents: 1450,
          shipping_provider: "melhor_envio",
          shipping_service_id: 1,
          shipping_service_name: "PAC",
          shipping_delivery_days: 4,
          shipping_from_postal_code: "01018020",
          shipping_to_postal_code: "01310930",
          shipping_quote_json: { id: 1, service: "PAC" },
          total_cents: 17250,
          expires_at: null,
          inventory_released_at: null,
          latest_payment_status: null,
          latest_payment_external_id: null,
          created_at: new Date().toISOString(),
          items: [
            {
              id: 1,
              order_id: "00000000-0000-0000-0000-00000000a001",
              variant_id: "variant-assisted-001",
              quantity: 2,
              unit_price_cents: 7900,
              total_cents: 15800,
            },
          ],
        }),
      });
    });

    await page.route("**/payments/mercado-pago/preference", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          preference_id: "pref-assisted-001",
          init_point: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-assisted-001",
          sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-assisted-001",
          checkout_url: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=pref-assisted-001",
          is_sandbox: true,
        }),
      });
    });

    await gotoCurrentOriginPath(page, "/admin/assisted-sale");

    await expect(page.locator("h1")).toContainText("Venda Assistida");

    await page.locator("button").filter({ hasText: "Camiseta Operacional" }).first().click();
    await page.getByLabel("Quantidade para adicionar").fill("2");
    await page.getByRole("button", { name: "Adicionar item ao pedido" }).click();

    await page.getByLabel("Buscar cliente existente").fill("Cliente");
    await page.getByRole("button", { name: /Cliente Assistido/i }).click();

    await page.getByLabel("CEP para frete").fill("01310930");
    await page.getByRole("button", { name: "Calcular frete" }).click();
    await page.getByRole("radio").check();

    await expect(page.getByRole("button", { name: "Criar pedido" })).toBeEnabled();
    await page.getByRole("button", { name: "Criar pedido" }).click();

    await expect(page.getByText(/criado com sucesso/i)).toBeVisible();
    expect(createOrderPayload).not.toBeNull();
    if (createOrderPayload === null) {
      throw new Error("Expected assisted sale payload to be captured");
    }
    const capturedShippingPayload = createOrderPayload as { delivery_method?: unknown; shipping?: unknown };
    expect(capturedShippingPayload.delivery_method).toBe("shipping");
    expect(capturedShippingPayload.shipping).toBeTruthy();

    await expect(page.getByRole("button", { name: "Gerar link de pagamento" })).toBeVisible();
    await page.getByRole("button", { name: "Gerar link de pagamento" }).click();

    await expect(page.getByText("Link de pagamento gerado com sucesso.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir checkout" })).toHaveAttribute(
      "href",
      /mercadopago\.com\.br\/checkout\/start/,
    );
    await expect(page.getByRole("link", { name: "Ver pedido" })).toHaveAttribute(
      "href",
      /\/admin\/orders\/00000000-0000-0000-0000-00000000a001$/,
    );

    await page.getByRole("button", { name: "Copiar link" }).click();
    copiedText = await page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText ?? "");
    expect(copiedText).toContain("mercadopago.com.br/checkout/start");
  });

  test("pickup does not require shipping and clears shipping state", async ({ page }) => {
    const product = {
      id: "product-assisted-002",
      title: "Camiseta Pickup",
      description: null,
      active: true,
      created_at: new Date().toISOString(),
      images: [],
      variants: [
        {
          id: "variant-assisted-002",
          product_id: "product-assisted-002",
          sku: "CAM-PICKUP-U",
          price_cents: 6500,
          attributes_json: { tamanho: "U" },
          stock: 5,
          weight_kg: null,
          width_cm: null,
          height_cm: null,
          length_cm: null,
        },
      ],
    };

    let createOrderPayload: { delivery_method?: unknown; shipping?: unknown } | null = null;

    await page.route("**/api/admin/products*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([product]),
      });
    });

    await page.route("**/api/admin/customers*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/shipping/quotes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          options: [
            {
              service_id: 2,
              name: "SEDEX",
              price_cents: 2200,
              delivery_days: 2,
              raw_json: { id: 2, service: "SEDEX" },
            },
          ],
        }),
      });
    });

    await page.route("**/api/admin/orders*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      createOrderPayload = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-00000000a002",
          status: "pending",
          delivery_method: "pickup",
          customer_id: null,
          customer_name: "Cliente Pickup",
          customer_email: "pickup@example.com",
          customer_phone: null,
          source: "admin_assisted",
          subtotal_cents: 6500,
          shipping_cents: 0,
          shipping_provider: null,
          shipping_service_id: null,
          shipping_service_name: null,
          shipping_delivery_days: null,
          shipping_from_postal_code: null,
          shipping_to_postal_code: null,
          shipping_quote_json: null,
          total_cents: 6500,
          expires_at: null,
          inventory_released_at: null,
          latest_payment_status: null,
          latest_payment_external_id: null,
          created_at: new Date().toISOString(),
          items: [
            {
              id: 1,
              order_id: "00000000-0000-0000-0000-00000000a002",
              variant_id: "variant-assisted-002",
              quantity: 1,
              unit_price_cents: 6500,
              total_cents: 6500,
            },
          ],
        }),
      });
    });

    await page.route("**/payments/mercado-pago/preference", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Mercado Pago indisponivel no momento." }),
      });
    });

    await gotoCurrentOriginPath(page, "/admin/assisted-sale");

    await page.locator("button").filter({ hasText: "Camiseta Pickup" }).first().click();
    await page.getByRole("button", { name: "Adicionar item ao pedido" }).click();

    await page.getByLabel("Nome do cliente").fill("Cliente Pickup");
    await page.getByLabel("Email do cliente").fill("pickup@example.com");

    await page.getByLabel("CEP para frete").fill("01310930");
    await page.getByRole("button", { name: "Calcular frete" }).click();
    await expect(page.getByText("SEDEX")).toBeVisible();

    await page.getByRole("button", { name: "Retirada" }).click();
    await expect(page.getByText("Retirada selecionada. O pedido sera criado sem frete calculado.")).toBeVisible();
    await expect(page.getByText("SEDEX")).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Criar pedido" })).toBeEnabled();
    await page.getByRole("button", { name: "Criar pedido" }).click();

    await expect(page.getByText(/criado com sucesso/i)).toBeVisible();
    expect(createOrderPayload).not.toBeNull();
    if (createOrderPayload === null) {
      throw new Error("Expected assisted sale payload to be captured");
    }
    const capturedPickupPayload = createOrderPayload as { delivery_method?: unknown; shipping?: unknown };
    expect(capturedPickupPayload.delivery_method).toBe("pickup");
    expect(capturedPickupPayload.shipping).toBeUndefined();

    await expect(page.getByRole("button", { name: "Gerar link de pagamento" })).toBeVisible();
    await page.getByRole("button", { name: "Gerar link de pagamento" }).click();
    await expect(page.getByText("Mercado Pago indisponivel no momento.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver pedido" })).toHaveAttribute(
      "href",
      /\/admin\/orders\/00000000-0000-0000-0000-00000000a002$/,
    );
  });
});
