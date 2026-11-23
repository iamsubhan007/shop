import { Geist } from "next/font/google";
import "./globals.css";
import ChromeGate from "@/components/ChromeGate";
import SupportButton from "@/components/SupportButton";
import { AuthProvider } from "@/context/AuthContext";
import { SiteProvider } from "@/context/SiteContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { getInitialSiteData } from "@/lib/server/siteData";
import { BUSINESS, DESCRIPTION, KEYWORDS, OG_IMAGE, SITE_NAME, TITLE, siteUrl } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Pages are built once and rebuilt in the background at most once a minute, so the menu in the first HTML stays fresh.
export const revalidate = 60;

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: TITLE, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "food",
  formatDetection: { telephone: true, address: true, email: true },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_PK",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${SITE_NAME}: fresh qeema naan and pizza naan in ${BUSINESS.area}` }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  // Local-search hints (region and place of the shop).
  other: { "geo.region": "PK-PB", "geo.placename": BUSINESS.area },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#b91c1c" };

export default async function RootLayout({ children }) {
  // Menu and settings, rendered into the page itself so the first paint is not an empty shell (see siteData.js).
  const initial = await getInitialSiteData();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased bg-background text-foreground min-h-screen flex flex-col selection:bg-red-600 selection:text-white`}
      >
        <SiteProvider initial={initial}>
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
