"use client";

import { useCart } from "@/components/cart-provider";

export function CartLink() {
  const { itemCount } = useCart();
  return `Cart (${itemCount})`;
}
