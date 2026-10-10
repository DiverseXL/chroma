import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chroma — AI Creative Director",
  description:
    "A multi-agent image generation system that turns a brief into a coherent image set.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
