import {
  BarChart3,
  BotMessageSquare,
  Code2,
  FileCheck2,
  FileText,
  FolderOpen,
  Layers3,
  MessageSquareText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import styles from "./AppPageUI.module.css";

export interface ProcessStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function AppPage({ children }: { children: ReactNode }) {
  return <section className={styles.page}>{children}</section>;
}

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className={styles.headerAction}>{action}</div> : null}
    </header>
  );
}

export function EmptyHero({
  kind,
  title,
  description,
  action,
  hint,
  children,
}: {
  kind: "project" | "report" | "interview";
  title: string;
  description: string;
  action: ReactNode;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`${styles.emptyHero} ${styles[kind]}`}>
      <div className={styles.emptyCopy}>
        <span className={styles.heroIcon} aria-hidden="true">
          {kind === "project" ? <FolderOpen /> : kind === "report" ? <FileText /> : <MessageSquareText />}
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
        <div className={styles.heroAction}>{action}</div>
        {hint ? <small>{hint}</small> : null}
      </div>
      <EmptyIllustration kind={kind} />
    </section>
  );
}

function EmptyIllustration({ kind }: { kind: "project" | "report" | "interview" }) {
  return (
    <div className={styles.illustration} aria-hidden="true">
      <span className={styles.orbit} />
      <span className={`${styles.artCard} ${styles.artCardMain}`}>
        {kind === "project" ? <FolderOpen /> : kind === "report" ? <BarChart3 /> : <BotMessageSquare />}
      </span>
      <span className={`${styles.artCard} ${styles.artCardLeft}`}><Code2 /></span>
      <span className={`${styles.artCard} ${styles.artCardRight}`}>
        {kind === "report" ? <FileCheck2 /> : <BarChart3 />}
      </span>
      <Sparkles className={styles.sparkleOne} />
      <Sparkles className={styles.sparkleTwo} />
    </div>
  );
}

export function ProcessSteps({ title, items, compact = false }: { title: string; items: ProcessStep[]; compact?: boolean }) {
  return (
    <section className={`${styles.section} ${compact ? styles.compactSteps : ""}`}>
      <h2>{title}</h2>
      <ol className={styles.steps} style={{ "--step-count": items.length } as CSSProperties}>
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <li key={item.title}>
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.stepIcon}><Icon aria-hidden="true" /></span>
              <div><strong>{item.title}</strong><p>{item.description}</p></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function FeatureGrid({ title, items }: { title: string; items: FeatureItem[] }) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      <div className={styles.features}>
        {items.map((item) => {
          const Icon = item.icon;
          return <article key={item.title}><span><Icon aria-hidden="true" /></span><div><strong>{item.title}</strong><p>{item.description}</p></div></article>;
        })}
      </div>
    </section>
  );
}

export function DataSurface({ children }: { children: ReactNode }) {
  return <div className={styles.dataSurface}>{children}</div>;
}

export const appPageIcons = { BarChart3, BotMessageSquare, Code2, FileCheck2, FileText, FolderOpen, Layers3, MessageSquareText };
