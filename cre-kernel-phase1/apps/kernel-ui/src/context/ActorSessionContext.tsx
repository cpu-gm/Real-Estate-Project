"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ActorSession = {
  actorId: string;
  actorName: string;
  role: string;
};

type ActorSessionContextValue = {
  dealId: string;
  session: ActorSession | null;
  warning: string | null;
  setSession: (session: ActorSession) => void;
  clearSession: (reason?: string) => void;
  setWarning: (warning: string | null) => void;
};

const ActorSessionContext = createContext<ActorSessionContextValue | undefined>(undefined);

export function ActorSessionProvider({
  dealId,
  children
}: {
  dealId: string;
  children: React.ReactNode;
}) {
  const storageKey = useMemo(() => `actorSession:${dealId}`, [dealId]);
  const [session, setSessionState] = useState<ActorSession | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredSession(storageKey);
    if (stored) {
      setSessionState(stored);
    } else {
      setSessionState(null);
    }
  }, [storageKey]);

  const setSession = (next: ActorSession) => {
    setSessionState(next);
    setWarning(null);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors.
    }
  };

  const clearSession = (reason?: string) => {
    setSessionState(null);
    if (reason) {
      setWarning(reason);
    }
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors.
    }
  };

  const value: ActorSessionContextValue = {
    dealId,
    session,
    warning,
    setSession,
    clearSession,
    setWarning
  };

  return (
    <ActorSessionContext.Provider value={value}>
      {children}
    </ActorSessionContext.Provider>
  );
}

export function useActorSession() {
  const context = useContext(ActorSessionContext);
  if (!context) {
    throw new Error("useActorSession must be used within ActorSessionProvider");
  }
  return context;
}

function loadStoredSession(storageKey: string): ActorSession | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ActorSession>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (
      typeof parsed.actorId === "string" &&
      parsed.actorId.trim().length > 0 &&
      typeof parsed.actorName === "string" &&
      parsed.actorName.trim().length > 0 &&
      typeof parsed.role === "string" &&
      parsed.role.trim().length > 0
    ) {
      return {
        actorId: parsed.actorId,
        actorName: parsed.actorName,
        role: parsed.role
      };
    }
  } catch {
    return null;
  }
  return null;
}