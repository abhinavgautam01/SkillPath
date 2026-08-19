import { addPropertyControls, ControlType } from "framer"

/**
 * Skillpath footer.
 *
 * Links and a copyright line. flex-wrap does the responsive work on its own:
 * side by side when there is room, copyright dropping to its own line when
 * there is not. No measuring, no breakpoints, no state.
 */

const DEFAULT_LINKS = [
  { label: "Courses", link: "#courses" },
  { label: "About", link: "#about" },
  { label: "Contact", link: "#contact" },
]

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function Footer(props) {
  const {
    links = DEFAULT_LINKS,
    copyright = "© 2026 Skillpath. All rights reserved.",
    style,
  } = props

  return (
    <footer style={{ ...footerStyles.footer, ...style }}>
      <nav style={footerStyles.links}>
        {links.map((item) => (
          <a key={item.label} href={item.link} style={footerStyles.link}>
            {item.label}
          </a>
        ))}
      </nav>
      <p style={footerStyles.copyright}>{copyright}</p>
    </footer>
  )
}

const footerStyles = {
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    // Row gap covers the wrapped case, column gap the side by side one.
    gap: "16px 24px",
    width: "100%",
    boxSizing: "border-box",
    padding: "32px 24px",
    borderTop: "1px solid #e6e8f0",
    background: "#ffffff",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  links: { display: "flex", flexWrap: "wrap", gap: 24 },
  link: { fontSize: 15, color: "#5b6076", textDecoration: "none" },
  copyright: { margin: 0, fontSize: 14, color: "#8b90a3" },
}

addPropertyControls(Footer, {
  links: {
    type: ControlType.Array,
    title: "Links",
    control: {
      type: ControlType.Object,
      controls: {
        label: { type: ControlType.String, title: "Label", defaultValue: "Courses" },
        link: { type: ControlType.String, title: "Link", defaultValue: "#" },
      },
    },
    defaultValue: DEFAULT_LINKS,
  },
  copyright: {
    type: ControlType.String,
    title: "Copyright",
    defaultValue: "© 2026 Skillpath. All rights reserved.",
  },
})
