import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "小说管理系统",
  description: "小说采集管理系统：多线程采集、正文清洗、站群分发、多主题前台与 TXT 下载注入一体化。",
  keywords: ["小说管理", "小说采集", "站群", "Next.js"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "小说管理系统",
    description: "采集 · 清洗 · 站群 · 多主题 · 下载注入 一体化",
    url: "https://chat.z.ai",
    siteName: "小说管理系统",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "小说管理系统",
    description: "采集 · 清洗 · 站群 · 多主题 · 下载注入 一体化",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
