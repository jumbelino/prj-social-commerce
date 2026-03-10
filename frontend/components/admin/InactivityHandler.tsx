"use client";

import { useEffect, useRef, useCallback } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export function InactivityHandler() {
  const pathname = usePathname();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const handleSignOut = useCallback(() => {
    signOut({ callbackUrl: "/admin?expired=true" });
  }, []);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      handleSignOut();
    }, INACTIVITY_TIMEOUT_MS);
  }, [handleSignOut]);

  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    
    events.forEach((event) => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, resetTimer]);

  return null;
}
