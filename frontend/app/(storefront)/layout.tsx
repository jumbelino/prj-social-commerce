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
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 sm:px-6 lg:px-10">
        <Header />
        <main className="flex-1 py-8">{children}</main>
      </div>
    </CartProvider>
  );
}
