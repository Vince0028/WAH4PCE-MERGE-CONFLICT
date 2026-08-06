import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Health Data Exchange Portal | Organization Gateway",
  description: "Multi-organization health data exchange portal for the WAH4PCE ADAPT LHIE system. Register your organization, set your data format, and exchange patient records securely.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
