interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <span className={`logo ${compact ? "logo-compact" : ""}`}>
      <svg className="logo-mark" viewBox="0 0 44 44" aria-hidden="true">
        <defs>
          <linearGradient id="logo-bright-gradient" x1="5" y1="22" x2="21" y2="4" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1285FF" />
            <stop offset="1" stopColor="#3B96FF" />
          </linearGradient>
          <linearGradient id="logo-main-gradient" x1="15" y1="39" x2="35" y2="13" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0968F0" />
            <stop offset="1" stopColor="#073EC7" />
          </linearGradient>
          <linearGradient id="logo-soft-gradient" x1="15" y1="28" x2="40" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor="#62B4FF" />
            <stop offset="1" stopColor="#79AFFF" />
          </linearGradient>
        </defs>
        <path data-role="upper" d="M6 21 21 4" fill="none" stroke="url(#logo-bright-gradient)" strokeWidth="8" strokeLinecap="round" />
        <path data-role="main" d="M16 38 34 14" fill="none" stroke="url(#logo-main-gradient)" strokeWidth="8" strokeLinecap="round" />
        <path data-role="connector" d="M15 27 23 18" fill="none" stroke="url(#logo-soft-gradient)" strokeWidth="7" strokeLinecap="round" opacity="0.72" />
        <path data-role="lower" d="M29 40 39 28" fill="none" stroke="url(#logo-soft-gradient)" strokeWidth="7" strokeLinecap="round" />
      </svg>
      <span className="logo-copy">
        <strong>码途 AI</strong>
        <small>HireScope AI</small>
      </span>
    </span>
  );
}
