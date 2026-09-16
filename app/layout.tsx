import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuestLearn",
  description: "Turn practice into a quest. Personalised, adaptive learning that plays like a game.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never block zoom — some readers need it.
  maximumScale: 5,
  themeColor: "#5b2fd6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:ql-btn focus:ql-btn-primary"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
