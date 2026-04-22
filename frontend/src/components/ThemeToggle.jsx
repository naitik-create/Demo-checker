import { useTheme } from "../theme/ThemeContext.jsx";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn btn--ghost" onClick={toggle} type="button" title="Toggle theme">
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

