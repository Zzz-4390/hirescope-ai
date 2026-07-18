import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_EXPIRED_EVENT } from "../lib/auth-session";
import { AuthSessionBoundary } from "./AuthSessionBoundary";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

describe("AuthSessionBoundary", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
  });

  it("redirects to login when the shared request layer expires the session", () => {
    render(<AuthSessionBoundary />);

    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));

    expect(navigation.replace).toHaveBeenCalledWith("/login");
  });
});
