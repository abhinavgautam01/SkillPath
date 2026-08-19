import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

// Minimal browser globals React needs.
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.HTMLElement = dom.window.HTMLElement
global.Element = dom.window.Element
global.Node = dom.window.Node
global.IS_REACT_ACT_ENVIRONMENT = true

// Controllable ResizeObserver: we drive the reported width ourselves instead of
// waiting on a real rendering lifecycle.
let observerCallback = null
let observedNode = null
global.ResizeObserver = dom.window.ResizeObserver = class {
  constructor(cb) { observerCallback = cb }
  observe(node) { observedNode = node }
  disconnect() {}
}
function reportWidth(px) {
  observerCallback?.([{ target: observedNode, borderBoxSize: [{ inlineSize: px }] }])
}

// Controllable fetch.
let fetchPlan = {}
global.fetch = async (url) => {
  const key = url.includes("country-code") ? "country" : "courses"
  const step = fetchPlan[key]
  const result = typeof step === "function" ? step() : step
  if (result.status !== 200) {
    return { ok: false, status: result.status, json: async () => ({ detail: "gg" }) }
  }
  return { ok: true, status: 200, json: async () => result.body }
}

const COURSES = [
  { courseName: "How To YouTube", courseCode: "a", description: "d".repeat(120), mainCategory: "Content Creation", courseType: "Original", pricePaise: 199900, priceUsdCents: 3999, refundable: true },
  { courseName: "Notion Second Brain", courseCode: "b", description: "d".repeat(120), mainCategory: "Productivity", courseType: "Workshop", pricePaise: 79900, priceUsdCents: 1499, refundable: false },
]

const { act } = await import("react")
const React = (await import("react")).default
const { createRoot } = await import("react-dom/client")
const { default: CoursesSection } = await import("../.tmp-bundle/CoursesSection.js")

const container = document.getElementById("root")
let root

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container)
    root.render(React.createElement(CoursesSection, props))
  })
  // Retries back off 350ms then 700ms, so the component is still mid-flight
  // right after mount. Wait past the worst case before asserting.
  await act(async () => { await sleep(1400) })
}
async function unmount() { await act(async () => root.unmount()) }

const text = () => container.textContent
const gridColumns = () => {
  const grid = [...container.querySelectorAll("div")].find((d) => d.style.display === "grid")
  return grid ? grid.style.gridTemplateColumns.match(/repeat\((\d)/)[1] : null
}
const cardCount = () => container.querySelectorAll("article").length
const cardsText = () =>
  [...container.querySelectorAll("article")].map((a) => a.textContent).join(" ")
const cardNames = () =>
  [...container.querySelectorAll("article h3")].map((h) => h.textContent).join(" > ")

const click = async (label) => {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent.includes(label)
  )
  if (!button) throw new Error(`no button matching "${label}"`)
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }))
  })
}

const selectSort = async (value) => {
  const select = container.querySelector("select")
  await act(async () => {
    select.value = value
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
  })
}

// Rupee order and dollar order disagree here on purpose, so sorting has to
// follow whichever currency is on screen rather than either field by habit.
const SKEWED = [
  { courseName: "Cheap In Dollars", courseCode: "x", description: "d", mainCategory: "A", courseType: "Original", pricePaise: 199900, priceUsdCents: 999, refundable: true },
  { courseName: "Cheap In Rupees", courseCode: "y", description: "d", mainCategory: "B", courseType: "Original", pricePaise: 99900, priceUsdCents: 3999, refundable: true },
]

let pass = 0, fail = 0
function check(label, actual, expected) {
  const ok = String(actual) === String(expected)
  if (ok) pass += 1
  else fail += 1
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}: ${actual}${ok ? "" : `  (expected ${expected})`}`)
}

/* ---------------- responsive ---------------- */
console.log("\nResponsive breakpoints (3 / 2 / 1)")
fetchPlan = { courses: { status: 200, body: COURSES }, country: { status: 200, body: { country_code: "IN" } } }
await mount()
for (const [width, expected] of [[1440, 3], [1000, 3], [940, 3], [939, 2], [700, 2], [620, 2], [619, 1], [390, 1], [320, 1]]) {
  await act(async () => reportWidth(width))
  check(`${width}px`, gridColumns(), expected)
}

/* ---------------- currency ---------------- */
console.log("\nCurrency")
check("IN price rendered", text().includes("₹1,999"), true)
check("IN not mis-scaled", text().includes("1,99,900"), false)
await unmount()

fetchPlan = { courses: { status: 200, body: COURSES }, country: { status: 200, body: { country_code: "US" } } }
await mount()
check("US price rendered", text().includes("$39.99"), true)
check("no rupee leak in cards", cardsText().includes("₹"), false)
await unmount()

/* ---------------- the four states ---------------- */
console.log("\nStates")
fetchPlan = { courses: { status: 200, body: COURSES }, country: { status: 200, body: { country_code: "IN" } } }
await mount()
check("success renders cards", cardCount(), 2)
check("refundable badge only when true", (text().match(/Refundable/g) || []).length, 1)
check("extra field shown", text().includes("Content Creation"), true)
await unmount()

fetchPlan = { courses: { status: 200, body: [] }, country: { status: 200, body: { country_code: "IN" } } }
await mount()
check("empty state", text().includes("No courses published yet"), true)
check("no cards", cardCount(), 0)
await unmount()

fetchPlan = { courses: { status: 500 }, country: { status: 200, body: { country_code: "IN" } } }
await mount()
check("error state", text().includes("having a moment"), true)
check("retry offered", text().includes("Try again"), true)
check("no raw error dumped", text().includes("gg") || text().includes("HttpError"), false)
await unmount()

/* ---------------- country fails, courses work ---------------- */
console.log("\nCountry down, courses up")
fetchPlan = { courses: { status: 200, body: COURSES }, country: { status: 500 } }
await mount({ fallbackCountry: "US" })
check("cards still render", cardCount(), 2)
check("fallback currency applied", text().includes("$39.99"), true)
check("visitor is told", text().includes("could not confirm your region"), true)
await unmount()

await mount({ fallbackCountry: "IN" })
check("fallback control respected", text().includes("₹1,999"), true)
await unmount()

/* ---------------- retry actually retries ---------------- */
console.log("\nRetry")
let attempts = 0
fetchPlan = {
  courses: () => { attempts += 1; return attempts < 3 ? { status: 404 } : { status: 200, body: COURSES } },
  country: { status: 200, body: { country_code: "IN" } },
}
await mount()
check("recovered after transient failures", cardCount(), 2)
check("attempts made", attempts, 3)
await unmount()

/* ---------------- manual currency switch ---------------- */
console.log("\nCurrency switch")
fetchPlan = { courses: { status: 200, body: COURSES }, country: { status: 200, body: { country_code: "IN" } } }
await mount()
check("starts from detected country", text().includes("\u20b91,999"), true)
await click("USD")
check("switches to dollars", text().includes("$39.99"), true)
check("rupees cleared", text().includes("\u20b91,999"), false)
await click("INR")
check("switches back to rupees", text().includes("\u20b91,999"), true)
check("dollars cleared", text().includes("$39.99"), false)
await unmount()

console.log("\nChoice outranks detection")
fetchPlan = { courses: { status: 200, body: COURSES }, country: { status: 500 } }
await mount({ fallbackCountry: "IN" })
check("fallback notice shown before choosing", text().includes("could not confirm your region"), true)
await click("USD")
check("choice applied", text().includes("$39.99"), true)
check("notice retired after choosing", text().includes("could not confirm your region"), false)
await unmount()

/* ---------------- sorting follows the active currency ---------------- */
console.log("\nSort follows currency")
fetchPlan = { courses: { status: 200, body: SKEWED }, country: { status: 200, body: { country_code: "IN" } } }
await mount()
await selectSort("price-asc")
check("cheapest first in rupees", cardNames(), "Cheap In Rupees > Cheap In Dollars")
await click("USD")
check("re-sorts on currency switch", cardNames(), "Cheap In Dollars > Cheap In Rupees")
await selectSort("price-desc")
check("descending in dollars", cardNames(), "Cheap In Rupees > Cheap In Dollars")
await unmount()

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
