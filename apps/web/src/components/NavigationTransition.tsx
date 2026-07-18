"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./NavigationTransition.module.css";

type TransitionPhase = "idle" | "leaving" | "entering";

interface PendingNavigation {
  fromPath: string;
  targetPath: string;
}

interface NavigationTransitionContextValue {
  phase: TransitionPhase;
  navigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  completeTransition: () => void;
}

const NavigationTransitionContext = createContext<NavigationTransitionContextValue | null>(null);
const TRANSITION_FALLBACK_MS = 500;
const ROUTE_FALLBACK_MS = 1600;

function reducedMotionIsPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isUnmodifiedPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function NavigationTransitionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const isTransitioningRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScheduledWork = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    animationFrameRef.current = null;
    fallbackTimerRef.current = null;
  }, []);

  const completeTransition = useCallback(() => {
    clearScheduledWork();
    pendingNavigationRef.current = null;
    isTransitioningRef.current = false;
    setPhase("idle");
  }, [clearScheduledWork]);

  const navigate = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (
      event.defaultPrevented
      || !isUnmodifiedPrimaryClick(event)
      || event.currentTarget.target === "_blank"
      || !href.startsWith("/")
      || href.startsWith("//")
    ) {
      return;
    }

    const target = new URL(href, window.location.href);
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const targetLocation = `${target.pathname}${target.search}${target.hash}`;

    if (targetLocation === currentLocation) {
      event.preventDefault();
      return;
    }

    if (reducedMotionIsPreferred()) return;

    event.preventDefault();
    if (isTransitioningRef.current) return;

    clearScheduledWork();
    isTransitioningRef.current = true;
    pendingNavigationRef.current = { fromPath: pathname, targetPath: target.pathname };
    setPhase("leaving");

    // Start the route request immediately; the transition is visual only.
    router.push(targetLocation);
    fallbackTimerRef.current = setTimeout(completeTransition, ROUTE_FALLBACK_MS);
  }, [clearScheduledWork, completeTransition, pathname, router]);

  useLayoutEffect(() => {
    const pendingNavigation = pendingNavigationRef.current;
    if (!pendingNavigation) return;
    if (pathname === pendingNavigation.fromPath && pathname !== pendingNavigation.targetPath) return;

    clearScheduledWork();
    setPhase("entering");
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setPhase("idle");
      fallbackTimerRef.current = setTimeout(completeTransition, TRANSITION_FALLBACK_MS);
    });
  }, [clearScheduledWork, completeTransition, pathname]);

  useLayoutEffect(() => clearScheduledWork, [clearScheduledWork]);

  const value = useMemo(
    () => ({ phase, navigate, completeTransition }),
    [completeTransition, navigate, phase],
  );

  return <NavigationTransitionContext.Provider value={value}>{children}</NavigationTransitionContext.Provider>;
}

type NavigationLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> &
  LinkProps & {
    href: string;
  };

export function NavigationLink({ href, onClick, ...props }: NavigationLinkProps) {
  const transition = useContext(NavigationTransitionContext);

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) transition?.navigate(event, href);
      }}
    />
  );
}

export function RouteTransitionBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const transition = useContext(NavigationTransitionContext);
  const phase = transition?.phase ?? "idle";

  return (
    <div
      className={`${styles.boundary} ${styles[phase]}`}
      data-route-transition-phase={phase}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity" && phase === "idle") {
          transition?.completeTransition();
        }
      }}
    >
      {children}
    </div>
  );
}
