import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sarabun } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageTracker from "@/components/PageTracker";
import CookieConsent from "@/components/CookieConsent";
import NavigationProgress from "@/components/NavigationProgress";
import AdsLoader from "@/components/AdsLoader";
import { getAdsConfig, getPublicAdsConfig } from "@/lib/ads";
import { Suspense } from "react";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/format";
import "./globals.css";

// next/font โหลดฟอนต์ตอน build แล้ว self-host → ไม่มี request ไป Google ตอนรันจริง และไม่มี layout shift
const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-sarabun",
});

const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "ThaiDataCorp คลังข้อมูลนิติบุคคลและธุรกิจไทย ค้นหาข้อมูลบริษัท เลขทะเบียนนิติบุคคล ทุนจดทะเบียน สถานะ ประเภทธุรกิจ บริษัทเปิดใหม่ และสัญญาจัดซื้อจัดจ้างภาครัฐ จากข้อมูลเปิดภาครัฐ ใช้ฟรี",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "th_TH",
    url: SITE_URL,
  },
  twitter: { card: "summary" },
  formatDetection: { telephone: false },
};

/** meta google-adsense-account ใช้ยืนยันความเป็นเจ้าของเว็บกับ AdSense (ใส่เมื่อมี Publisher ID) */
export async function generateMetadata(): Promise<Metadata> {
  // ใส่ทันทีที่มี Publisher ID (แม้ยังไม่เปิดโฆษณา) — ใช้ยืนยันเว็บกับ AdSense ระหว่างรอการอนุมัติ
  const ads = await getAdsConfig().catch(() => null);
  return ads?.publisherId ? { ...baseMetadata, other: { "google-adsense-account": ads.publisherId } } : baseMetadata;
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f9fa",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const ads = await getPublicAdsConfig().catch(() => null);
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="flex min-h-screen flex-col">
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:p-2">
          ข้ามไปยังเนื้อหา
        </a>
        <Header />
        <div id="content" className="flex-1">
          {children}
        </div>
        <Footer />
        {/* useSearchParams ต้องอยู่ใน Suspense เพื่อไม่ให้หน้า static กลายเป็น dynamic */}
        <Suspense fallback={null}>
          <PageTracker />
          <NavigationProgress />
          {ads && <AdsLoader config={ads} />}
        </Suspense>
        <CookieConsent ads={Boolean(ads)} />
      </body>
    </html>
  );
}
