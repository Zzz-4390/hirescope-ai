"use client";

import { createContext, useContext } from "react";

import type { CurrentUser } from "../lib/auth";

export const AppUserContext = createContext<CurrentUser | null>(null);

export function useAppUser() {
  return useContext(AppUserContext);
}
