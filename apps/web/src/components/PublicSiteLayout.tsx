import type { ReactNode } from "react";

export function PublicSiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="public-site-layout">{children}</div>;
}
