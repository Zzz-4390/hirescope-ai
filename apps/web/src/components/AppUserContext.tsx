"use client";

import { createContext, useContext } from "react";

import type { CurrentUser } from "../lib/auth";

export const AppUserContext = createContext<CurrentUser | null>(null);

interface AppAvatarContextValue {
  avatarUrl: string | null;
  setAvatarFile: (file: File | null) => void;
}

export const AppAvatarContext = createContext<AppAvatarContextValue>({
  avatarUrl: null,
  setAvatarFile: () => undefined,
});

interface AppProjectContextValue {
  selectedProjectId: string;
  selectProject: (projectId: string) => void;
}

export const AppProjectContext = createContext<AppProjectContextValue>({
  selectedProjectId: "",
  selectProject: () => undefined,
});

export function useAppUser() {
  return useContext(AppUserContext);
}

export function useAppAvatar() {
  return useContext(AppAvatarContext);
}

export function useAppProject() {
  return useContext(AppProjectContext);
}
