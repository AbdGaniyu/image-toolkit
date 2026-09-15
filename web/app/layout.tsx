import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// The Modernist system is set entirely in Archivo (see modernist.css).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Image Toolkit · Remove backgrounds, resize, convert, watermark",
  description: "Drop an image, pick a tool, download the result. Nothing is stored.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variable goes on <html> so the :root tokens that reference it resolve.
    <html lang="en" className={archivo.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
