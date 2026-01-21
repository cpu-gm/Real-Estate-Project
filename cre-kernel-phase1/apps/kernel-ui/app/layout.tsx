import "./globals.css";
import Link from "next/link";
import { KernelStatusBanner } from "@/components/KernelStatusBanner";

export const metadata = {
  title: "CRE Kernel UI",
  description: "Kernel-faithful UI for Phase 2A"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <KernelStatusBanner />
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">CRE Kernel</p>
                <p className="text-lg font-semibold text-slate-900">Phase 2A UI</p>
              </div>
              <Link className="text-sm text-slate-700 hover:text-slate-900" href="/">
                Home
              </Link>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
