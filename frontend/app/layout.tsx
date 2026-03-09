import type { Metadata } from "next";
import Link from "next/link";

import { CartLink } from "@/components/cart-link";
import { CartProvider } from "@/components/cart-provider";
import { Header } from "@/components/header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Commerce Storefront",
  description: "MVP storefront with cart and checkout",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <CartProvider>
            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 sm:px-6 lg:px-10">
              <Header />
              <main className="flex-1 py-8">{children}</main>
            </div>
          </CartProvider>
        </Providers>
      </body>
    </html>
  );
}
