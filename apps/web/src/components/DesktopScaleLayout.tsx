import type { ReactNode } from "react";

export function DesktopScaleLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="desktop-scale-layout">{children}</div>;
}
