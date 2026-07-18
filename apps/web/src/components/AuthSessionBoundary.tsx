"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AUTH_SESSION_EXPIRED_EVENT } from "../lib/auth-session";

export function AuthSessionBoundary() {
  const router = useRouter();

  useEffect(() => {
    const redirectToLogin = () => router.replace("/login");
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, redirectToLogin);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, redirectToLogin);
  }, [router]);

  return null;
}
