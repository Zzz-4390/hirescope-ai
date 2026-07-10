import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleRevealManager } from "./RoleRevealManager";

describe("RoleRevealManager", () => {
  beforeEach(() => { document.body.innerHTML='<main class="role-entry-page"><section class="role-reveal-section"></section></main>'; });
  it("reveals an observed section once", () => {
    let callback: IntersectionObserverCallback=()=>undefined; const unobserve=vi.fn();
    vi.stubGlobal("matchMedia",vi.fn(()=>({matches:false})));
    vi.stubGlobal("IntersectionObserver",vi.fn((next:IntersectionObserverCallback)=>{callback=next;return{observe:vi.fn(),unobserve,disconnect:vi.fn()};}));
    render(<RoleRevealManager/>); const section=document.querySelector<HTMLElement>(".role-reveal-section");
    act(()=>callback([{isIntersecting:true,target:section} as unknown as IntersectionObserverEntry],{} as IntersectionObserver));
    expect(section).toHaveClass("is-visible"); expect(unobserve).toHaveBeenCalledWith(section);
  });
  it("shows content immediately with reduced motion",()=>{vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true})));vi.stubGlobal("IntersectionObserver",vi.fn());render(<RoleRevealManager/>);expect(document.querySelector(".role-reveal-section")).toHaveClass("is-visible");});
});
