import { addPropertyControls, ControlType } from "framer"

/**
 * Skillpath hero.
 *
 * No data, no state. Type scales with the viewport through clamp() rather than
 * breakpoints, so it reads correctly at every width without a second copy of
 * the layout to maintain.
 */

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function Hero(props) {
  const {
    eyebrow = "Skillpath",
    headline = "Learn the skill. Then actually use it.",
    subline = "Short, practical courses from people who do the work, so you finish with something built rather than a certificate nobody asked for.",
    buttonLabel = "Browse courses",
    buttonLink = "#courses",
    style,
  } = props

  return (
    <section style={{ ...heroStyles.section, ...style }}>
      {eyebrow && <span style={heroStyles.eyebrow}>{eyebrow}</span>}
      <h1 style={heroStyles.headline}>{headline}</h1>
      {subline && <p style={heroStyles.subline}>{subline}</p>}
      {buttonLabel && (
        <a href={buttonLink} style={heroStyles.button}>
          {buttonLabel}
        </a>
      )}
    </section>
  )
}

const heroStyles = {
  section: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 18,
    width: "100%",
    boxSizing: "border-box",
    // clamp() carries the responsive work, so padding tightens on a phone
    // without needing a per-breakpoint override.
    padding: "clamp(64px, 9vw, 96px) 24px clamp(48px, 7vw, 72px)",
    textAlign: "center",
    background: "linear-gradient(180deg, #f5f6ff 0%, #ffffff 100%)",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#0f1222",
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#4f46e5",
  },
  headline: {
    maxWidth: 760,
    margin: 0,
    fontSize: "clamp(34px, 6vw, 60px)",
    fontWeight: 700,
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
  },
  subline: {
    maxWidth: 560,
    margin: 0,
    fontSize: "clamp(16px, 2vw, 18px)",
    lineHeight: 1.6,
    color: "#5b6076",
  },
  button: {
    marginTop: 10,
    padding: "14px 28px",
    fontSize: 16,
    fontWeight: 600,
    color: "#ffffff",
    textDecoration: "none",
    background: "#4f46e5",
    borderRadius: 12,
  },
}

addPropertyControls(Hero, {
  headline: {
    type: ControlType.String,
    title: "Headline",
    defaultValue: "Learn the skill. Then actually use it.",
    displayTextArea: true,
  },
  subline: {
    type: ControlType.String,
    title: "Subline",
    defaultValue:
      "Short, practical courses from people who do the work, so you finish with something built rather than a certificate nobody asked for.",
    displayTextArea: true,
  },
  eyebrow: { type: ControlType.String, title: "Eyebrow", defaultValue: "Skillpath" },
  buttonLabel: { type: ControlType.String, title: "Button", defaultValue: "Browse courses" },
  buttonLink: { type: ControlType.String, title: "Link", defaultValue: "#courses" },
})
