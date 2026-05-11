import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // v3.1 resets everyone to light (Motadata brand theme)
    const themeVersion = localStorage.getItem("uiThemeVersion");
    if (themeVersion !== "3.1") {
      localStorage.setItem("uiTheme", "light");
      localStorage.setItem("uiThemeVersion", "3.1");
      return "light";
    }
    const saved = localStorage.getItem("uiTheme");
    return saved === "light" || saved === "dark" ? saved : "light";
  });

  useEffect(() => {
    localStorage.setItem("uiTheme", theme);
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggle() {
        setTheme((t) => (t === "dark" ? "light" : "dark"));
      }
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

