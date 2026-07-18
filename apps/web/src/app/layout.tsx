import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthSessionBoundary } from "../components/AuthSessionBoundary";
import "./globals.css";

const themeInitializationScript = `(() => {
  try {
    const storedTheme = localStorage.getItem("hirescope-theme");
    document.documentElement.dataset.theme = storedTheme === "dark" ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export const metadata: Metadata = {
  title: "码途 AI | 让项目能力被看见",
  description: "通过 AI 项目审查、模拟面试与能力报告，帮助求职者展示真实技术能力。",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <AuthSessionBoundary />
        {children}
      </body>
    </html>
  );
}
