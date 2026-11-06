import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "كاش كلاود — نظام المحاسبة ونقاط البيع السعودي المتكامل",
  description:
    "نظام سحابي عربي متكامل للمحاسبة والمخزون ونقاط البيع بتوافق زتكا — فواتير إلكترونية معتمدة، مخزون متعدد المستودعات، رواتب وتقارير لحظية. جرب مجاناً.",
  keywords: [
    "كاش كلاود",
    "محاسبة",
    "سحابي",
    "نقاط بيع",
    "إدارة أعمال",
    "زتكا",
    "فاتوريا",
    "الفاتورة الإلكترونية",
    "مخزون",
    "فروع",
  ],
  icons: {
    icon: "/images/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${tajawal.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
