import type { Metadata } from "next";
import { JetBrains_Mono, Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ROTARA | Earth-Informed Crop Rotation Intelligence",
  description:
    "Agricultural decision-support platform for farmers and agronomists in Punjab, Pakistan powered by NASA Earth observations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#F6F5F0] text-[#1A221C]">{children}</body>
    </html>
  );
}
