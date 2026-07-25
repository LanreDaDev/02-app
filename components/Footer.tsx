export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid #E5E0D8",
        padding: "32px",
        textAlign: "center",
        fontFamily: "'Outfit', sans-serif",
        fontSize: "12px",
        color: "#9C9088",
        letterSpacing: "0.06em",
      }}
    >
      <a href="https://olade.com" style={{ color: "#9C9088", textDecoration: "none" }}>
        olade.com
      </a>
      {" · "}
      <a href="https://olade.com/privacy" style={{ color: "#9C9088", textDecoration: "none" }}>
        Privacy
      </a>
      {" · "}
      <a href="https://olade.com/terms" style={{ color: "#9C9088", textDecoration: "none" }}>
        Terms
      </a>
    </footer>
  );
}
