import { expect, test } from "@playwright/test";

const REAL_PRODUCT = {
  productId: "e7b11ddc-68c9-44b6-95dc-87fced2153e5",
  productTitle: "Test Product with Image",
  variantId: "aec958b8-8508-492b-b21b-e1a8afbefbbf",
  sku: "IMG-1773205495966",
  unitPriceCents: 5990,
  quantity: 1,
};

const CART_WITH_ITEMS = {
  items: [REAL_PRODUCT],
  destinationPostalCode: null,
  selectedShipping: null,
};

const CART_WITH_VALID_CEP = {
  items: [REAL_PRODUCT],
  destinationPostalCode: "01018020",
  selectedShipping: null,
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

test.describe("Cart Shipping Flow", () => {
  test("cart page shows empty state when no items", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "social-commerce-cart",
        JSON.stringify({ items: [], destinationPostalCode: null, selectedShipping: null })
      );
    });

    await page.goto("/cart");
    await expect(page.getByText("Cart is empty")).toBeVisible();
  });

  test("cart validates CEP input requires exactly 8 digits", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_ITEMS);

    await page.goto("/cart");

    const calculateButton = page.getByRole("button", { name: /Calcular|calculating/i });
    await expect(calculateButton).toBeDisabled();

    const cepInput = page.locator('input[id="destinationPostalCode"]');
    await cepInput.click();
    await cepInput.type("123");
    await page.waitForTimeout(300);

    await expect(calculateButton).toBeDisabled();

    await cepInput.fill("01234567");
    await page.waitForTimeout(300);

    await expect(calculateButton).toBeEnabled();
  });

  test("persists destinationPostalCode across page reload", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_VALID_CEP);

    await page.goto("/cart");

    const cepInput = page.locator('input[id="destinationPostalCode"]');
    await expect(cepInput).toHaveValue("01018020");

    await page.reload();
    await expect(cepInput).toHaveValue("01018020");
  });

  test("checkout button is disabled without shipping selection", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_VALID_CEP);

    await page.goto("/cart");

    const continueButton = page.getByRole("button", { name: /Continue to checkout/i });
    await expect(continueButton).toBeDisabled();
  });

  test("requesting shipping quotes shows options and enables checkout after selection", async ({ page }) => {
    let hasCorsError = false;
    page.on("console", msg => {
      if (msg.text().includes("CORS") || msg.text().includes("blocked by CORS")) {
        hasCorsError = true;
      }
    });

    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_VALID_CEP);

    await page.goto("/cart");

    const calculateButton = page.getByRole("button", { name: /Calcular freight|frete/i });
    await expect(calculateButton).toBeEnabled();
    await calculateButton.click();

    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    const hasDias = pageContent.includes("dias");
    const hasShippingError = pageContent.includes("Shipping quote failed");

    if (hasCorsError) {
      throw new Error("CORS blocked shipping quote request - ensure NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 in test environment");
    }

    if (hasShippingError && !hasDias) {
      throw new Error("Shipping quote failed");
    }

    const shippingOption = page.getByRole("button", { name: /dias/i });
    await expect(shippingOption.first()).toBeVisible({ timeout: 15000 });

    await shippingOption.first().click();

    const continueButton = page.getByRole("button", { name: /Continue to checkout/i });
    await expect(continueButton).toBeEnabled();
  });

  test("persists selectedShipping across page reload", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/cart");

    const summarySection = page.getByText("Frete").first();
    await expect(summarySection).toBeVisible();

    await page.reload();
    await expect(summarySection).toBeVisible();

    const continueButton = page.getByRole("button", { name: /Continue to checkout/i });
    await expect(continueButton).toBeEnabled();
  });

  test("checkout receives shipping data from cart", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_SELECTED_SHIPPING);

    await page.goto("/checkout");

    await expect(page.getByText("Selected shipping")).toBeVisible();
    await expect(page.getByText("PAC")).toBeVisible();
    await expect(page.getByText("CEP destino: 01018020")).toBeVisible();

    const submitButton = page.getByRole("button", { name: /Create order/i });
    await expect(submitButton).toBeEnabled();
  });

  test("checkout redirects to cart when no shipping selected", async ({ page }) => {
    await page.addInitScript((cart) => {
      window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
    }, CART_WITH_VALID_CEP);

    await page.goto("/checkout");

    await expect(page.getByText(/Shipping selection is required|Redirecting/i)).toBeVisible({ timeout: 5000 });
  });
});
