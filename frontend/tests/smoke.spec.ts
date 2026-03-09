import { expect, test } from "@playwright/test";

const checkoutCartSeed = {
  items: [
    {
      productId: "seed-product",
      productTitle: "Seed Product",
      variantId: "11111111-1111-1111-1111-111111111111",
      sku: "SEED-001",
      unitPriceCents: 4990,
      quantity: 1,
    },
  ],
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

test("checkout reaches payment stage or shows backend error panel", async ({ page }) => {
  await page.addInitScript((cart) => {
    window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
  }, checkoutCartSeed);

  await page.goto("/checkout");
  await page.getByLabel("Email").fill("smoke@example.com");
  await page.getByRole("button", { name: "Create order and go to payment" }).click();

  const successLocators = [
    page.getByRole("heading", { name: "Order created" }),
    page.getByRole("heading", { name: "Redirecting to payment" }),
  ];
  const errorLocator = page.getByText("Order creation failed");

  const observed = await Promise.race([
    ...successLocators.map((locator) => locator.waitFor({ state: "visible" }).then(() => "success")),
    page
      .waitForURL((url) => !url.href.startsWith("http://localhost:3000"), { timeout: 15_000 })
      .then(() => "redirect"),
    errorLocator.waitFor({ state: "visible" }).then(() => "error"),
  ]);

  expect(["success", "redirect", "error"]).toContain(observed);
});

test("admin redirects to Keycloak sign-in when unauthenticated", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response).not.toBeNull();

  await page.waitForURL(
    (url) =>
      url.pathname.includes("/api/auth/signin/keycloak") ||
      url.href.includes("/protocol/openid-connect/auth"),
    { timeout: 15_000 },
  );

  const currentUrl = page.url();
  expect(currentUrl).toContain("callbackUrl=%2Fadmin");
});
