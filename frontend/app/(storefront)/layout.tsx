import type React from "react";
import { CartProvider } from "@/components/cart-provider";
import { Header } from "@/components/header";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <div className="storefront-theme min-h-screen w-full">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 sm:px-6 lg:px-8">
          <Header />
          <main className="flex-1 py-8 sm:py-10">{children}</main>
        </div>
      </div>
    </CartProvider>
  );
}
