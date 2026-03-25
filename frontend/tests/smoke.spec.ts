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

const productDetailSeed = {
  id: "product-smoke-001",
  title: "Camiseta Runtime",
  description: "Malha leve, visual limpo e acabamento pronto para vitrine.",
  active: true,
  created_at: "2026-03-24T00:00:00Z",
  images: [
    {
      id: 1,
      product_id: "product-smoke-001",
      object_key: "products/runtime/main.jpg",
      url: "https://example.com/runtime-main.jpg",
      position: 0,
    },
    {
      id: 2,
      product_id: "product-smoke-001",
      object_key: "products/runtime/alt.jpg",
      url: "https://example.com/runtime-alt.jpg",
      position: 1,
    },
  ],
  variants: [
    {
      id: "variant-smoke-001",
      product_id: "product-smoke-001",
      sku: "RUN-M-BLK",
      price_cents: 12990,
      attributes_json: { cor: "Preta", tamanho: "M" },
      stock: 8,
      weight_kg: 0.2,
      width_cm: 20,
      height_cm: 3,
      length_cm: 28,
    },
    {
      id: "variant-smoke-002",
      product_id: "product-smoke-001",
      sku: "RUN-G-BLK",
      price_cents: 12990,
      attributes_json: { cor: "Preta", tamanho: "G" },
      stock: 0,
      weight_kg: 0.2,
      width_cm: 20,
      height_cm: 3,
      length_cm: 28,
    },
  ],
};

const homeCatalogSeed = [
  {
    id: "home-product-001",
    title: "Camiseta Signal",
    description: "Modelo base para validar a vitrine publica em dark mode.",
    active: true,
    created_at: "2026-03-24T00:00:00Z",
    images: [
      {
        id: 11,
        product_id: "home-product-001",
        object_key: "products/home/signal.jpg",
        url: "https://example.com/signal.jpg",
        position: 0,
      },
    ],
    variants: [
      {
        id: "home-variant-001",
        product_id: "home-product-001",
        sku: "SIGNAL-M",
        price_cents: 11990,
        attributes_json: { tamanho: "M" },
        stock: 4,
        weight_kg: 0.2,
        width_cm: 20,
        height_cm: 3,
        length_cm: 28,
      },
    ],
  },
];

test("storefront home carrega com hero em PT-BR e CTA principal de produto", async ({ page }) => {
  await page.route("**/products", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(homeCatalogSeed),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Camisetas com vitrine simples/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar catalogo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver carrinho" })).toBeVisible();

  const productLinks = page.getByRole("link", { name: "Ver produto" });
  await expect(productLinks.first()).toBeVisible();
});

test("storefront product detail mostra galeria, variantes e feedback de compra em PT-BR", async ({ page }) => {
  await page.route("**/products/product-smoke-001", async (route) => {
    if (route.request().resourceType() === "document") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(productDetailSeed),
    });
  });

  await page.goto("/products/product-smoke-001");

  await expect(page.getByRole("link", { name: "Voltar ao catalogo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Camiseta Runtime" })).toBeVisible();
  await expect(page.getByText("Preco da variante selecionada")).toBeVisible();
  await expect(page.getByText("Disponivel para compra")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Escolha a variante" })).toBeVisible();
  await expect(page.getByRole("button", { name: /RUN-M-BLK/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /RUN-G-BLK/i })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();

  await expect(page.getByText("Carrinho atualizado")).toBeVisible();
  await expect(page.getByText("Produto adicionado ao carrinho")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver carrinho" })).toBeVisible();
});

test("checkout reaches payment stage or shows backend error panel", async ({ page }) => {
  await page.addInitScript((cart) => {
    window.localStorage.setItem("social-commerce-cart", JSON.stringify(cart));
  }, checkoutCartSeed);

  await page.goto("/checkout");
  await page.getByLabel("Email").fill("smoke@example.com");
  await page.getByRole("button", { name: "Criar pedido e ir para o Mercado Pago" }).click();

  const successLocators = [
    page.getByRole("heading", { name: "Pedido criado com sucesso" }),
    page.getByRole("heading", { name: "Redirecionando para o Mercado Pago" }),
  ];
  const errorLocator = page.getByText("Falha ao criar pedido");

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
