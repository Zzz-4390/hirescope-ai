interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <span className={`logo ${compact ? "logo-compact" : ""}`}>
      <svg className="logo-mark" viewBox="0 0 44 44" aria-hidden="true">
        <defs>
          <linearGradient id="logo-gradient" x1="4" y1="40" x2="40" y2="4">
            <stop stopColor="#49A4FF" />
            <stop offset="1" stopColor="#0066CC" />
          </linearGradient>
        </defs>
        <rect x="4" y="18" width="28" height="8" rx="4" transform="rotate(-45 4 18)" fill="url(#logo-gradient)" />
        <rect x="13" y="27" width="30" height="8" rx="4" transform="rotate(-45 13 27)" fill="url(#logo-gradient)" />
        <rect x="22" y="36" width="25" height="8" rx="4" transform="rotate(-45 22 36)" fill="url(#logo-gradient)" />
      </svg>
      <span className="logo-copy">
        <strong>码途 AI</strong>
        <small>HireScope AI</small>
      </span>
    </span>
  );
}
