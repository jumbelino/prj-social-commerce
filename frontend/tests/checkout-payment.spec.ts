import { expect, test } from "@playwright/test";

const REAL_PRODUCT = {
  productId: "e7b11ddc-68c9-44b6-95dc-87fced2153e5",
  productTitle: "Test Product with Image",
  variantId: "aec958b8-8508-492b-b21b-e1a8afbefbbf",
  sku: "IMG-1773205495966",
  unitPriceCents: 5990,
  quantity: 1,
};

const CART_WITH_SELECTED_SHIPPING = {
  items: [REAL_PRODUCT],
  destinationPostalCode: "01018020",
  selectedShipping: {
    provider: "melhor_envio",
    serviceId: 1,
    serviceName: "PAC",
    priceCents: 1200,
    deliveryDays: 5,
    quoteRaw: { service_id: 1, name: "PAC" },
  },
};

test.describe("Checkout Payment Methods", () => {
  test("checkout page shows both payment method options", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/checkout");

    await expect(page.getByText("Mercado Pago", { exact: true })).toBeVisible();
    await expect(page.getByText("PIX via Mercado Pago")).toBeVisible();

    const checkoutProRadio = page.locator('input[value="checkout_pro"]');
    await expect(checkoutProRadio).toBeChecked();

    await expect(page.getByRole("button", { name: /Create order and go to payment/i })).toBeVisible();
  });

  test("checkout enables PIX payment method selection", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/checkout");

    const pixRadio = page.locator('input[value="pix"]');
    await pixRadio.click();

    await expect(pixRadio).toBeChecked();

    await expect(page.getByRole("button", { name: /Create order with PIX/i })).toBeVisible({ timeout: 15000 });
  });

  test("checkout shows order created and Checkout Pro redirect section", async ({ page }) => {
    let orderCreated = false;
    let preferenceCreated = false;

    await page.route("**/orders", async (route) => {
      if (route.request().method() === "POST") {
        orderCreated = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-order-123",
            status: "pending",
            customer_name: "Test Buyer",
            customer_email: "test@example.com",
            customer_phone: "+551199999999",
            source: "storefront",
            subtotal_cents: 5990,
            shipping_cents: 1200,
            shipping_provider: "melhor_envio",
            shipping_service_id: 1,
            shipping_service_name: "PAC",
            shipping_delivery_days: 5,
            shipping_from_postal_code: "01018020",
            shipping_to_postal_code: "01018020",
            shipping_quote_json: null,
            total_cents: 7190,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            inventory_released_at: null,
            latest_payment_status: null,
            latest_payment_external_id: null,
            created_at: new Date().toISOString(),
            items: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/payments/mercado-pago/preference", async (route) => {
      if (route.request().method() === "POST") {
        preferenceCreated = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            preference_id: "preference-123",
            init_point: "https://www.mercadopago.com.br/checkout/start?pref_id=preference-123",
            sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=preference-123",
            checkout_url: "https://sandbox.mercadopago.com.br/checkout/start?pref_id=preference-123",
            is_sandbox: true,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    await page.fill("#customerName", "Test Buyer");
    await page.fill("#customerEmail", "test@example.com");
    await page.fill("#customerPhone", "+551199999999");

    await page.getByRole("button", { name: /Create order and go to payment/i }).click();

    await page.waitForFunction(() => {
      return document.body.innerText.includes("Order created") || 
             document.body.innerText.includes("Preference ID");
    }, { timeout: 10000 });

    expect(orderCreated).toBe(true);
    expect(preferenceCreated).toBe(true);

    await expect(page.getByText("Order created")).toBeVisible();
    await expect(page.getByText("Order ID:").locator("span")).toHaveText("test-order-123");

    await expect(page.getByRole("heading", { name: "Redirecting to payment" })).toBeVisible();
    await expect(page.getByText("Preference ID:").locator("span")).toHaveText("preference-123");
  });

  test("checkout shows order created and PIX payment details", async ({ page }) => {
    let orderCreated = false;
    let pixPaymentCreated = false;

    await page.route("**/orders", async (route) => {
      if (route.request().method() === "POST") {
        orderCreated = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-order-456",
            status: "pending",
            customer_name: "PIX Buyer",
            customer_email: "pix@example.com",
            customer_phone: "+551188888888",
            source: "storefront",
            subtotal_cents: 5990,
            shipping_cents: 1200,
            shipping_provider: "melhor_envio",
            shipping_service_id: 1,
            shipping_service_name: "PAC",
            shipping_delivery_days: 5,
            shipping_to_postal_code: "01018020",
            total_cents: 7190,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            inventory_released_at: null,
            latest_payment_status: null,
            latest_payment_external_id: null,
            created_at: new Date().toISOString(),
            items: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/payments/mercado-pago", async (route) => {
      if (route.request().method() === "POST") {
        pixPaymentCreated = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            payment_id: "pix-12345678",
            status: "pending",
            qr_code: "00020101021243650016br.gov.bcb.pix0136a@teste.com0217PIX Payment1234567890123456304ABCD",
            qr_code_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            ticket_url: null,
            external_reference: "test-order-456",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/checkout");

    await page.fill("#customerName", "PIX Buyer");
    await page.fill("#customerEmail", "pix@example.com");
    await page.fill("#customerPhone", "+551188888888");

    const pixRadio = page.locator('input[value="pix"]');
    await pixRadio.click();

    await page.getByRole("button", { name: /Create order with PIX/i }).click();

    await page.waitForTimeout(1500);

    expect(orderCreated).toBe(true);
    expect(pixPaymentCreated).toBe(true);

    await expect(page.getByText("Order created")).toBeVisible();
    await expect(page.getByText("Order ID:").locator("span")).toHaveText("test-order-456");

    await expect(page.getByRole("heading", { name: "PIX Payment" })).toBeVisible();
    await expect(page.getByText("Payment ID:").locator("span")).toHaveText("pix-12345678");
    await expect(page.getByText("PIX Copy/Paste Code:")).toBeVisible();
    await expect(page.getByText("PIX QR Code:")).toBeVisible();

    await expect(page.getByText("Redirecting to payment")).not.toBeVisible();
  });

  test("checkout shows explicit error when payment API fails", async ({ page }) => {
    let orderCreated = false;

    await page.route("**/orders", async (route) => {
      if (route.request().method() === "POST") {
        orderCreated = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-order-fail",
            status: "pending",
            customer_name: "Fail Buyer",
            customer_email: "fail@example.com",
            customer_phone: "+551177777777",
            source: "storefront",
            subtotal_cents: 5990,
            shipping_cents: 1200,
            shipping_provider: "melhor_envio",
            shipping_service_id: 1,
            shipping_service_name: "PAC",
            shipping_delivery_days: 5,
            shipping_to_postal_code: "01018020",
            total_cents: 7190,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            inventory_released_at: null,
            latest_payment_status: null,
            latest_payment_external_id: null,
            created_at: new Date().toISOString(),
            items: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/payments/mercado-pago/preference", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "Invalid or expired Mercado Pago access token. Please check API credentials.",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/checkout");

    await page.fill("#customerName", "Fail Buyer");
    await page.fill("#customerEmail", "fail@example.com");
    await page.fill("#customerPhone", "+551177777777");

    await page.getByRole("button", { name: /Create order and go to payment/i }).click();

    await page.waitForTimeout(1500);

    expect(orderCreated).toBe(true);

    await expect(page.getByText("Payment request failed")).toBeVisible();
    await expect(page.getByText(/Invalid or expired Mercado Pago access token/)).toBeVisible();
  });

  test("checkout result page shows explicit success and clears cart after payment approval", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.route("**/payments/mercado-pago/sync", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-order-success",
            status: "paid",
            customer_id: 1,
            customer_name: "Approved Buyer",
            customer_email: "approved@example.com",
            customer_phone: "+551199999999",
            source: "storefront",
            subtotal_cents: 5990,
            shipping_cents: 1200,
            shipping_provider: "melhor_envio",
            shipping_service_id: 1,
            shipping_service_name: "PAC",
            shipping_delivery_days: 5,
            shipping_from_postal_code: "01018020",
            shipping_to_postal_code: "01018020",
            shipping_quote_json: null,
            total_cents: 7190,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            inventory_released_at: null,
            latest_payment_status: "approved",
            latest_payment_external_id: "mp-approved-1",
            created_at: new Date().toISOString(),
            items: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout/result?order_id=test-order-success&payment_id=mp-approved-1&status=approved");

    await expect(page.getByRole("heading", { name: "Pagamento confirmado" })).toBeVisible();
    await expect(page.getByText(/Status do pedido:/)).toBeVisible();
    await expect(page.getByText(/Status do pagamento:/)).toBeVisible();
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem("social-commerce-cart");
      return typeof raw === "string" && raw.includes("\"items\":[]");
    });
    const storedCart = await page.evaluate(() => window.localStorage.getItem("social-commerce-cart"));
    expect(storedCart).toContain("\"items\":[]");
  });

  test("checkout result page shows pending payment explicitly", async ({ page }) => {
    await page.route("**/payments/mercado-pago/sync", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-order-pending",
            status: "pending",
            customer_id: 1,
            customer_name: "Pending Buyer",
            customer_email: "pending@example.com",
            customer_phone: "+551199999999",
            source: "storefront",
            subtotal_cents: 5990,
            shipping_cents: 1200,
            shipping_provider: "melhor_envio",
            shipping_service_id: 1,
            shipping_service_name: "PAC",
            shipping_delivery_days: 5,
            shipping_from_postal_code: "01018020",
            shipping_to_postal_code: "01018020",
            shipping_quote_json: null,
            total_cents: 7190,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            inventory_released_at: null,
            latest_payment_status: "pending",
            latest_payment_external_id: "mp-pending-1",
            created_at: new Date().toISOString(),
            items: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout/result?order_id=test-order-pending&payment_id=mp-pending-1&status=pending");

    await expect(page.getByRole("heading", { name: "Pagamento pendente" })).toBeVisible();
    await expect(page.getByText(/O pedido foi criado, mas o pagamento ainda não foi confirmado/)).toBeVisible();
  });

  test("checkout result page shows rejected payment explicitly", async ({ page }) => {
    await page.route("**/payments/mercado-pago/sync", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-order-rejected",
            status: "cancelled",
            customer_id: 1,
            customer_name: "Rejected Buyer",
            customer_email: "rejected@example.com",
            customer_phone: "+551199999999",
            source: "storefront",
            subtotal_cents: 5990,
            shipping_cents: 1200,
            shipping_provider: "melhor_envio",
            shipping_service_id: 1,
            shipping_service_name: "PAC",
            shipping_delivery_days: 5,
            shipping_from_postal_code: "01018020",
            shipping_to_postal_code: "01018020",
            shipping_quote_json: null,
            total_cents: 7190,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            inventory_released_at: new Date().toISOString(),
            latest_payment_status: "rejected",
            latest_payment_external_id: "mp-rejected-1",
            created_at: new Date().toISOString(),
            items: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout/result?order_id=test-order-rejected&payment_id=mp-rejected-1&status=rejected");

    await expect(page.getByRole("heading", { name: "Pagamento rejeitado" })).toBeVisible();
    await expect(page.getByText(/Estoque devolvido em/)).toBeVisible();
  });
});
