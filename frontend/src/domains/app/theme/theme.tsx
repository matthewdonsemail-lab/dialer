import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

/** Keep in sync with the pre-paint script in index.html. */
const STORAGE_KEY = "dialer-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // storage blocked — fall back to the OS setting
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

interface ThemeContextValue {
  /** What the operator chose. */
  mode: ThemeMode;
  /** What is showing now ("system" resolved against the OS). */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Light / dark / follow-the-OS theme. Toggles the `dark` class on <html>,
 * which switches every --ods-* colour token (index.css) and Tailwind `dark:`
 * variants. The choice is saved per browser.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked — applies for this session only
    }
  };

  return <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
