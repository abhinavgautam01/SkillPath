/**
 * Local stand-in for Framer's runtime.
 *
 * CoursesSection.jsx is meant to be pasted into Framer untouched, so it imports
 * from "framer" like any real code component. That package does not exist in a
 * plain Vite app, so vite.config.js aliases "framer" to this file for local dev.
 * Inside Framer the alias does not apply, so the real runtime is used instead.
 */

// Framer reads these to draw the properties panel. Nothing to do off-platform.
export function addPropertyControls() {}

export const ControlType = {
  String: "string",
  Enum: "enum",
  Color: "color",
  Boolean: "boolean",
  Number: "number",
}
