import { useAppSettings } from "../context/AppSettingsContext.jsx";

function MotadataWordmark({ color, fontSize, svgSize }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, lineHeight: 1 }}>
      <span style={{ fontWeight: 900, fontSize, letterSpacing: "-0.05em", color }}>m</span>
      <svg viewBox="0 0 30 30" width={svgSize} height={svgSize} fill="none" style={{ margin: "0 2px", flexShrink: 0 }}>
        <path d="M 15 15 L 15 6 A 9 9 0 0 1 24 15 Z" fill="#f4845f" />
        <path d="M 24 15 A 9 9 0 1 1 15 6" stroke={color} strokeWidth="4" fill="none" strokeLinecap="butt" />
      </svg>
      <span style={{ fontWeight: 900, fontSize, letterSpacing: "-0.05em", color }}>tadata</span>
    </div>
  );
}

/**
 * variant  – "light" (dark-colored logo, for white/light backgrounds)
 *           "dark"  (light-colored logo, for dark backgrounds)
 * color    – fallback SVG text/ring color
 * fontSize – fallback SVG font size
 * svgSize  – fallback SVG 'o' pixel size
 * imgHeight– uploaded image display height
 */
export default function AppLogo({ variant = "light", color = "#1a1a1a", fontSize = "2rem", svgSize = 24, imgHeight = 36 }) {
  const { logoUrl, logoDarkUrl } = useAppSettings();

  const img = variant === "dark" ? logoDarkUrl : logoUrl;

  if (img) {
    return (
      <img
        src={img}
        alt="Logo"
        style={{ height: imgHeight, maxWidth: 220, objectFit: "contain", display: "block" }}
      />
    );
  }

  return <MotadataWordmark color={color} fontSize={fontSize} svgSize={svgSize} />;
}
