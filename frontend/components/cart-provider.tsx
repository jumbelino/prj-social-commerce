"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "social-commerce-cart";

export type CartItem = {
  productId: string;
  productTitle: string;
  variantId: string;
  sku: string;
  unitPriceCents: number;
  quantity: number;
};

export type SelectedShippingOption = {
  provider: "melhor_envio";
  serviceId: number;
  serviceName: string;
  priceCents: number;
  deliveryDays: number;
  quoteRaw?: object;
};

type CartState = {
  items: CartItem[];
  destinationPostalCode: string | null;
  selectedShipping: SelectedShippingOption | null;
};

type CartContextValue = {
  items: CartItem[];
  destinationPostalCode: string | null;
  selectedShipping: SelectedShippingOption | null;
  itemCount: number;
  totalCents: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  setDestinationPostalCode: (value: string | null) => void;
  setSelectedShipping: (option: SelectedShippingOption | null) => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

function emptyCartState(): CartState {
  return {
    items: [],
    destinationPostalCode: null,
    selectedShipping: null,
  };
}

function parseCartItems(rawItems: unknown): CartItem[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const item = entry as Partial<CartItem>;
      return {
        productId: String(item.productId ?? ""),
        productTitle: String(item.productTitle ?? ""),
        variantId: String(item.variantId ?? ""),
        sku: String(item.sku ?? ""),
        unitPriceCents: Number(item.unitPriceCents ?? 0),
        quantity: Number(item.quantity ?? 0),
      };
    })
    .filter(
      (item) =>
        item.productId !== "" &&
        item.productTitle !== "" &&
        item.variantId !== "" &&
        item.sku !== "" &&
        Number.isFinite(item.unitPriceCents) &&
        Number.isFinite(item.quantity) &&
        item.unitPriceCents >= 0 &&
        item.quantity > 0,
    );
}

function parseSelectedShipping(rawSelectedShipping: unknown): SelectedShippingOption | null {
  if (typeof rawSelectedShipping !== "object" || rawSelectedShipping === null) {
    return null;
  }

  const candidate = rawSelectedShipping as Partial<SelectedShippingOption>;
  if (
    candidate.provider !== "melhor_envio" ||
    typeof candidate.serviceName !== "string" ||
    !Number.isFinite(candidate.serviceId) ||
    !Number.isFinite(candidate.priceCents) ||
    !Number.isFinite(candidate.deliveryDays)
  ) {
    return null;
  }

  const quoteRaw =
    typeof candidate.quoteRaw === "object" && candidate.quoteRaw !== null ? candidate.quoteRaw : undefined;

  return {
    provider: "melhor_envio",
    serviceId: Number(candidate.serviceId),
    serviceName: candidate.serviceName,
    priceCents: Number(candidate.priceCents),
    deliveryDays: Number(candidate.deliveryDays),
    quoteRaw,
  };
}

function parseStoredCart(raw: string | null): CartState {
  if (!raw) {
    return emptyCartState();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        items: parseCartItems(parsed),
        destinationPostalCode: null,
        selectedShipping: null,
      };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return emptyCartState();
    }

    const payload = parsed as {
      items?: unknown;
      destinationPostalCode?: unknown;
      selectedShipping?: unknown;
    };

    return {
      items: parseCartItems(payload.items),
      destinationPostalCode:
        typeof payload.destinationPostalCode === "string" ? payload.destinationPostalCode : null,
      selectedShipping: parseSelectedShipping(payload.selectedShipping),
    };
  } catch {
    return emptyCartState();
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>(emptyCartState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedState = parseStoredCart(localStorage.getItem(STORAGE_KEY));
    setState(storedState);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isHydrated) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isHydrated, state]);

  const { items, destinationPostalCode, selectedShipping } = state;

  const addItem = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => {
    if (quantity <= 0) {
      return;
    }

    setState((current) => {
      const found = current.items.find((entry) => entry.variantId === item.variantId);
      if (!found) {
        return {
          ...current,
          items: [...current.items, { ...item, quantity }],
        };
      }

      return {
        ...current,
        items: current.items.map((entry) =>
          entry.variantId === item.variantId
            ? {
                ...entry,
                quantity: entry.quantity + quantity,
              }
            : entry,
        ),
      };
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setState((current) => ({
      ...current,
      items: current.items.filter((entry) => entry.variantId !== variantId),
    }));
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setState((current) => {
      if (quantity <= 0) {
        return {
          ...current,
          items: current.items.filter((entry) => entry.variantId !== variantId),
        };
      }

      return {
        ...current,
        items: current.items.map((entry) =>
          entry.variantId === variantId
            ? {
                ...entry,
                quantity,
              }
            : entry,
        ),
      };
    });
  }, []);

  const clearCart = useCallback(() => {
    setState((current) => ({
      ...current,
      items: [],
    }));
  }, []);

  const setDestinationPostalCode = useCallback((value: string | null) => {
    setState((current) => ({
      ...current,
      destinationPostalCode: value,
    }));
  }, []);

  const setSelectedShipping = useCallback((option: SelectedShippingOption | null) => {
    setState((current) => ({
      ...current,
      selectedShipping: option,
    }));
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((total, item) => total + item.quantity, 0);
    const totalCents = items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);

    return {
      items,
      destinationPostalCode,
      selectedShipping,
      itemCount,
      totalCents,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      setDestinationPostalCode,
      setSelectedShipping,
    };
  }, [
    addItem,
    clearCart,
    destinationPostalCode,
    items,
    removeItem,
    selectedShipping,
    setDestinationPostalCode,
    setSelectedShipping,
    updateQuantity,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
