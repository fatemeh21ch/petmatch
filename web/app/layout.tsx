import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import { AuthProvider, Toaster } from "@/lib/client";
import "./globals.css";
import "./extra.css";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], weight: ["400", "500", "700", "800"], variable: "--font-vazir", display: "swap" });

export const metadata: Metadata = {
  title: { default: "پت‌مچ | مقایسه هوشمند قیمت محصولات حیوانات خانگی", template: "%s | پت‌مچ" },
  description: "جست‌وجو و مقایسه قیمت غذا، خاک و تشویقی گربه و سگ در فروشگاه‌های مختلف، با قیمت نهایی و متناسب با حیوان شما",
};
export const viewport: Viewport = { themeColor: "#13566c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable}>
      <body>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
