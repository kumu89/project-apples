import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ワードクラッシュ",
  description: "みんなで言葉カードを選んで投票するパーティーゲーム。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
