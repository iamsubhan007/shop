import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ChromeGate from "@/components/ChromeGate";
import SupportButton from "@/components/SupportButton";
import { AuthProvider } from "@/context/AuthContext";
import { SiteProvider } from "@/context/SiteContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Haq Bahu Naan Shop | Authentic Tandoori & Gourmet Naans in Lahore",
  description: "Order piping hot freshly baked Tandoori Naans, Cheese Naans, Qeema Naans & Deals online with live delivery tracking in Model Town, Lahore.",
  keywords: "Haq Bahu Naan, Lahore Naan, Tandoori Naan, Cheese Naan, Model Town Lahore Food, Online Food Delivery Lahore",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col selection:bg-red-600 selection:text-white`}
      >
        <SiteProvider>
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              <ChromeGate />
              <main className="flex-1">
                {children}
              </main>
              <ChromeGate drawer />
              <SupportButton />
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
        </SiteProvider>
      </body>
    </html>
  );
}
