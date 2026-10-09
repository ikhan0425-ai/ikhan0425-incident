import type { Metadata, Viewport } from "next";
import { Footer, Header } from "@/components/Header";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} - AI 그림 모델 & 이미지 공유`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: "#0f1012",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
