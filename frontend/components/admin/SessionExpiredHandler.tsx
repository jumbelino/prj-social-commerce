"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function SessionExpiredHandler() {
  const { data: session } = useSession();
  const router = useRouter();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (session?.error && !shown) {
      setShown(true);
      alert("Sua sessão expirou por inatividade. Você será redirecionado para fazer login novamente.");
      signOut({ callbackUrl: "/admin?expired=true" });
    }
  }, [session?.error, router, shown]);

  return null;
}
