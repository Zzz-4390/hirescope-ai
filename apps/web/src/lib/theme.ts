export const THEME_STORAGE_KEY = "hirescope-theme";

export type AppTheme = "light" | "dark";

export function setTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for this session when storage is unavailable.
  }
}

export const themeInitializationScript = `(() => {
  const root = document.documentElement;
  try {
    const storedTheme = localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme = storedTheme === "dark" ? "dark" : "light";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch {
    root.dataset.theme = "light";
    root.style.colorScheme = "light";
  }
})();`;
