import gcpLogo from "../assets/google-cloud-logo.png";

/**
 * Sar7ny (صارحني) Official Logo with Google Cloud Brand Mark.
 */
export default function Logo({
  size = 36,
  showText = true,
  showTagline = false,
  className = "",
}) {
  const markSize = size;
  const fontSize = Math.round(size * 0.62);

  return (
    <div
      className={`brand-logo ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.65rem",
        textDecoration: "none",
        userSelect: "none",
      }}
    >
      <img
        src={gcpLogo}
        alt="Google Cloud"
        width={markSize}
        height={markSize}
        style={{
          width: `${markSize}px`,
          height: `${markSize}px`,
          objectFit: "contain",
          flexShrink: 0,
          display: "block",
        }}
      />

      {showText && (
        <div
          style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}
        >
          <span
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            صارحني
          </span>
          {showTagline && (
            <span
              style={{
                fontSize: `${Math.round(fontSize * 0.42)}px`,
                color: "var(--text-3, #94a3b8)",
                fontWeight: 500,
                marginTop: "1px",
              }}
            >
              رسائل مجهولة بكل صدق
            </span>
          )}
        </div>
      )}
    </div>
  );
}
