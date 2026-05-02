import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rivus Protocol",
  description: "Payment streaming primitive for the Soroban ecosystem.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-rivus-bg text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}