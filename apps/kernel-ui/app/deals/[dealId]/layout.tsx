"use client";

import { useState } from "react";
import { ActorSessionProvider } from "@/context/ActorSessionContext";
import { ActorSessionBanner } from "@/components/ActorSessionBanner";
import { ActorSessionSelector } from "@/components/ActorSessionSelector";

type DealLayoutProps = {
  children: React.ReactNode;
  params: { dealId: string };
};

export default function DealLayout({ children, params }: DealLayoutProps) {
  const [showSelector, setShowSelector] = useState(false);

  return (
    <ActorSessionProvider dealId={params.dealId}>
      <div className="space-y-4">
        <ActorSessionBanner onChange={() => setShowSelector((prev) => !prev)} />
        {showSelector && (
          <ActorSessionSelector onClose={() => setShowSelector(false)} />
        )}
        {children}
      </div>
    </ActorSessionProvider>
  );
}