import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * Skillpath course grid.
 *
 * Reads two endpoints that fail on purpose roughly one request in three. The
 * two calls are independent, so they run together and are resolved separately:
 * losing the country code must never cost us a course list we already have.
 */

const BASE_URL = "https://syncsphere-hiv6.onrender.com"
const COURSES_ENDPOINT = `${BASE_URL}/assignment/course-data`
const COUNTRY_ENDPOINT = `${BASE_URL}/assignment/country-code`

const REQUEST_TIMEOUT_MS = 12000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 350

const SUPPORTED_COUNTRIES = ["IN", "US"]

const CURRENCY_OPTIONS = [
  { code: "IN", label: "\u20b9 INR" },
  { code: "US", label: "$ USD" },
]

// Measured against the component's own box rather than the viewport, so the
// grid still reflows correctly if the section is dropped into a narrow column.
const TWO_COLUMN_MIN_WIDTH = 620
const THREE_COLUMN_MIN_WIDTH = 940

/* ------------------------------------------------------------------ *
 * Data layer
 * ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status) {
    super(`Request failed with status ${status}`)
    this.name = "HttpError"
    this.status = status
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error("Aborted"))
      },
      { once: true }
    )
  })
}

/**
 * One GET, with a timeout so a hung socket cannot leave the UI spinning.
 *
 * The status check matters more than it looks. A failing response here is still
 * valid JSON, for example {"detail":"gg"} on a 500, so res.json() resolves
 * happily and hands back an object where the grid expects an array. Reading
 * res.ok first is what turns that into a real error instead of a blank section.
 */
async function fetchJson(url, outerSignal) {
  const controller = new AbortController()
  const timeoutError = new Error("The request timed out")
  timeoutError.name = "TimeoutError"

  const timer = setTimeout(() => controller.abort(timeoutError), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort(outerSignal.reason)

  if (outerSignal.aborted) controller.abort(outerSignal.reason)
  else outerSignal.addEventListener("abort", forwardAbort)

  try {
    // GET only. Every other method on this API answers 405, and nothing here
    // changes server state, which is also why retrying below is safe.
    const response = await fetch(url, { method: "GET", signal: controller.signal })
    if (!response.ok) throw new HttpError(response.status)
    return await response.json()
  } finally {
    clearTimeout(timer)
    outerSignal.removeEventListener("abort", forwardAbort)
  }
}

/**
 * The API injects 404s and 500s at random, so a status code says nothing about
 * whether the resource is really gone. That makes retrying every failure the
 * right call here, where normally a 404 would be pointless to repeat. Three
 * attempts take a one in three failure rate down to roughly one in twenty-seven.
 */
async function fetchWithRetry(url, signal) {
  let lastError

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJson(url, signal)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_BASE_DELAY_MS * attempt, signal)
    }
  }

  throw lastError
}

function isUsableCourse(course) {
  return (
    course !== null &&
    typeof course === "object" &&
    typeof course.courseName === "string" &&
    Number.isFinite(course.pricePaise) &&
    Number.isFinite(course.priceUsdCents)
  )
}

function parseCourses(payload) {
  if (!Array.isArray(payload)) throw new Error("Course response was not an array")
  // A card with no name or no price is worse than one card fewer.
  return payload.filter(isUsableCourse)
}

function parseCountryCode(payload) {
  const code = payload?.country_code
  if (!SUPPORTED_COUNTRIES.includes(code)) throw new Error(`Unusable country code: ${code}`)
  return code
}

function describeError(error) {
  if (error?.name === "TimeoutError") return "That took longer than expected."
  if (error instanceof HttpError && error.status >= 500) return "The course service is having a moment."
  if (error instanceof HttpError) return "We could not reach the course list."
  return "Something went wrong while loading courses."
}

/**
 * Owns the section's whole lifecycle: loading, ready, error, plus whether the
 * country code is real or assumed. The country result is stored separately from
 * the fallback so changing the fallback prop re-prices instantly without a refetch.
 */
function useCourseData() {
  const [state, setState] = useState({
    status: "loading",
    courses: [],
    country: null,
    errorMessage: null,
  })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    // allSettled, not all: `all` would reject the pair the moment the country
    // call fails, throwing away a course list that may have arrived just fine.
    Promise.allSettled([
      fetchWithRetry(COURSES_ENDPOINT, signal).then(parseCourses),
      fetchWithRetry(COUNTRY_ENDPOINT, signal).then(parseCountryCode),
    ]).then(([coursesResult, countryResult]) => {
      if (signal.aborted) return

      const country = countryResult.status === "fulfilled" ? countryResult.value : null

      if (coursesResult.status === "rejected") {
        setState({
          status: "error",
          courses: [],
          country,
          errorMessage: describeError(coursesResult.reason),
        })
        return
      }

      setState({ status: "ready", courses: coursesResult.value, country, errorMessage: null })
    })

    return () => controller.abort()
  }, [reloadToken])

  // Resetting to loading here rather than inside the effect. The click is what
  // causes the state change, so it is the click that should express it.
  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, status: "loading", errorMessage: null }))
    setReloadToken((token) => token + 1)
  }, [])

  return { ...state, reload }
}

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

/**
 * Both price fields are in minor units, so both divide by 100. 199900 paise is
 * 1,999 rupees and 3999 cents is 39.99 dollars. Intl does the grouping because
 * Indian digit grouping is 2-2-3 above a thousand, not 3-3-3, and hand rolled
 * comma insertion gets that wrong every time.
 */
function buildPriceFormatter(country) {
  if (country === "IN") {
    const formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    })
    return (course) => formatter.format(course.pricePaise / 100)
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  })
  return (course) => formatter.format(course.priceUsdCents / 100)
}

/** Tracks the width of the section itself so the column count follows its box. */
function useElementWidth(ref) {
  // Seeded to a constant rather than window.innerWidth on purpose. Framer server
  // renders published pages, so reading the real width here would make the
  // client's first render disagree with the server's on any narrow screen, and
  // React would throw the whole server tree away and rebuild it. The observer
  // below corrects the width on mount, before the browser paints.
  const [width, setWidth] = useState(THREE_COLUMN_MIN_WIDTH)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      // Border box, not contentRect. contentRect subtracts the section's own
      // horizontal padding, which would put every breakpoint 48px out of step
      // with the widths the constants above are written against.
      const borderBox = entry.borderBoxSize?.[0]?.inlineSize
      setWidth(borderBox ?? node.getBoundingClientRect().width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return width
}

function columnsForWidth(width) {
  if (width >= THREE_COLUMN_MIN_WIDTH) return 3
  if (width >= TWO_COLUMN_MIN_WIDTH) return 2
  return 1
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function CoursesSection(props) {
  const {
    title = "Courses built to be finished",
    fallbackCountry = "IN",
    style,
  } = props

  const { status, courses, country, errorMessage, reload } = useCourseData()
  const [query, setQuery] = useState("")
  const [sortOrder, setSortOrder] = useState("default")
  // null until the visitor picks a currency themselves. Their choice outranks
  // whatever the country endpoint said, so it is stored separately rather than
  // overwriting the detected value.
  const [chosenCountry, setChosenCountry] = useState(null)

  const sectionRef = useRef(null)
  const sectionWidth = useElementWidth(sectionRef)
  const columns = columnsForWidth(sectionWidth)

  // When the country call fails we still have to price every card. Showing a
  // number with no currency, or hiding the whole grid, are both worse than
  // pricing from a stated default and saying out loud that we guessed.
  // Once the visitor has chosen, saying we guessed their region is just noise.
  const countryIsAssumed = status === "ready" && country === null && chosenCountry === null
  const activeCountry = chosenCountry ?? country ?? fallbackCountry
  const formatPrice = useMemo(() => buildPriceFormatter(activeCountry), [activeCountry])

  const visibleCourses = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const matching = needle
      ? courses.filter(
          (course) =>
            course.courseName.toLowerCase().includes(needle) ||
            (course.mainCategory ?? "").toLowerCase().includes(needle)
        )
      : courses

    if (sortOrder === "default") return matching

    // Sort on the field actually being displayed, so the order always matches
    // the prices the visitor can see.
    const priceOf = (course) =>
      activeCountry === "IN" ? course.pricePaise : course.priceUsdCents

    return [...matching].sort((a, b) =>
      sortOrder === "price-asc" ? priceOf(a) - priceOf(b) : priceOf(b) - priceOf(a)
    )
  }, [courses, query, sortOrder, activeCountry])

  const isFiltered = query.trim().length > 0

  return (
    <section ref={sectionRef} style={{ ...courseStyles.section, ...style }}>
      <style>{keyframes}</style>

      <header style={courseStyles.header}>
        <h2 style={courseStyles.title}>{title}</h2>
        <p style={courseStyles.subtitle}>
          {status === "ready"
            ? `${courses.length} ${courses.length === 1 ? "course" : "courses"} available right now`
            : "Fresh from the Skillpath catalogue"}
        </p>
      </header>

      {status === "ready" && courses.length > 0 && (
        <div style={courseStyles.toolbar}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            style={courseStyles.search}
          />
          <div style={courseStyles.currencyToggle} role="group" aria-label="Currency">
            {CURRENCY_OPTIONS.map((option) => {
              const isActive = activeCountry === option.code
              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setChosenCountry(option.code)}
                  aria-pressed={isActive}
                  style={{
                    ...courseStyles.currencyButton,
                    ...(isActive ? courseStyles.currencyButtonActive : null),
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            aria-label="Sort courses"
            style={courseStyles.select}
          >
            <option value="default">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
      )}

      {countryIsAssumed && courses.length > 0 && (
        <p style={courseStyles.notice} role="status">
          We could not confirm your region, so prices are shown in{" "}
          {activeCountry === "IN" ? "rupees" : "US dollars"}.
        </p>
      )}

      {status === "loading" && <SkeletonGrid columns={columns} />}

      {status === "error" && <ErrorPanel message={errorMessage} onRetry={reload} />}

      {status === "ready" && courses.length === 0 && (
        <EmptyState
          heading="No courses published yet"
          body="The catalogue is empty at the moment. Check back shortly."
          actionLabel="Refresh"
          onAction={reload}
        />
      )}

      {status === "ready" && courses.length > 0 && visibleCourses.length === 0 && (
        <EmptyState
          heading={`Nothing matches "${query.trim()}"`}
          body="Try a different word, or clear the search to see everything."
          actionLabel="Clear search"
          onAction={() => setQuery("")}
        />
      )}

      {status === "ready" && visibleCourses.length > 0 && (
        <div style={gridStyle(columns)}>
          {visibleCourses.map((course) => (
            <CourseCard
              key={course.courseCode ?? course.courseName}
              course={course}
              price={formatPrice(course)}
            />
          ))}
        </div>
      )}

      {isFiltered && visibleCourses.length > 0 && (
        <p style={courseStyles.resultCount}>
          Showing {visibleCourses.length} of {courses.length}
        </p>
      )}
    </section>
  )
}

function CourseCard({ course, price }) {
  return (
    <article style={courseStyles.card}>
      <div style={courseStyles.cardTags}>
        {/* mainCategory is the extra field. Of everything the API returns it is
            the one a learner scans for, ahead of internal keys like mangoId. */}
        {course.mainCategory && <span style={courseStyles.category}>{course.mainCategory}</span>}
        {course.refundable === true && <span style={courseStyles.refundable}>Refundable</span>}
      </div>

      <h3 style={courseStyles.cardTitle}>{course.courseName}</h3>
      <p style={courseStyles.description}>{course.description}</p>

      <div style={courseStyles.cardFooter}>
        <span style={courseStyles.price}>{price}</span>
        {course.courseType && <span style={courseStyles.courseType}>{course.courseType}</span>}
      </div>
    </article>
  )
}

function SkeletonGrid({ columns }) {
  // Same grid, same card height, so nothing jumps when the real data lands.
  return (
    <div style={gridStyle(columns)} aria-busy="true" aria-label="Loading courses">
      {Array.from({ length: columns * 2 }, (_, index) => (
        <div key={index} style={courseStyles.skeletonCard}>
          <div style={{ ...courseStyles.shimmer, width: "35%", height: 20, borderRadius: 999 }} />
          <div style={{ ...courseStyles.shimmer, width: "80%", height: 22 }} />
          <div style={{ ...courseStyles.shimmer, width: "100%", height: 14 }} />
          <div style={{ ...courseStyles.shimmer, width: "65%", height: 14 }} />
          <div style={{ ...courseStyles.shimmer, width: "40%", height: 24, marginTop: "auto" }} />
        </div>
      ))}
    </div>
  )
}

function ErrorPanel({ message, onRetry }) {
  return (
    <div style={courseStyles.panel} role="alert">
      <h3 style={courseStyles.panelHeading}>{message}</h3>
      <p style={courseStyles.panelBody}>
        We tried {MAX_ATTEMPTS} times before giving up. One more attempt usually does it.
      </p>
      <button type="button" onClick={onRetry} style={courseStyles.button}>
        Try again
      </button>
    </div>
  )
}

function EmptyState({ heading, body, actionLabel, onAction }) {
  return (
    <div style={courseStyles.panel}>
      <h3 style={courseStyles.panelHeading}>{heading}</h3>
      <p style={courseStyles.panelBody}>{body}</p>
      <button type="button" onClick={onAction} style={courseStyles.buttonQuiet}>
        {actionLabel}
      </button>
    </div>
  )
}

function gridStyle(columns) {
  return {
    display: "grid",
    // An explicit count rather than auto-fill, because the brief asks for 3, 2
    // then 1 exactly. 1fr tracks mean a row of 5 cards or 7 cards fills evenly.
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: 20,
    alignItems: "stretch",
  }
}

const keyframes = `@keyframes skillpath-shimmer { 0% { opacity: 0.45 } 50% { opacity: 1 } 100% { opacity: 0.45 } }`

const courseStyles = {
  section: {
    width: "100%",
    boxSizing: "border-box",
    padding: "72px 24px",
    background: "#ffffff",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#0f1222",
  },
  header: { maxWidth: 640, margin: "0 auto 28px", textAlign: "center" },
  title: { margin: 0, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em" },
  subtitle: { margin: "10px 0 0", fontSize: 16, color: "#5b6076" },
  toolbar: { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 24 },
  search: {
    flex: "1 1 220px",
    maxWidth: 320,
    padding: "11px 14px",
    fontSize: 15,
    fontFamily: "inherit",
    color: "#0f1222",
    background: "#ffffff",
    border: "1px solid #e6e8f0",
    borderRadius: 10,
    outline: "none",
  },
  select: {
    padding: "11px 14px",
    fontSize: 15,
    fontFamily: "inherit",
    color: "#0f1222",
    background: "#ffffff",
    border: "1px solid #e6e8f0",
    borderRadius: 10,
    cursor: "pointer",
  },
  currencyToggle: {
    display: "flex",
    gap: 2,
    padding: 3,
    background: "#f2f3f8",
    border: "1px solid #e6e8f0",
    borderRadius: 10,
  },
  currencyButton: {
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#5b6076",
    background: "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  currencyButtonActive: {
    color: "#0f1222",
    background: "#ffffff",
    boxShadow: "0 1px 2px rgba(15, 18, 34, 0.10)",
  },
  notice: {
    maxWidth: 620,
    margin: "0 auto 24px",
    padding: "10px 14px",
    fontSize: 14,
    color: "#7a5a12",
    background: "#fff8e6",
    border: "1px solid #f2e0b0",
    borderRadius: 10,
    textAlign: "center",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    height: "100%",
    boxSizing: "border-box",
    padding: 22,
    background: "#ffffff",
    border: "1px solid #e6e8f0",
    borderRadius: 16,
    boxShadow: "0 1px 2px rgba(15, 18, 34, 0.04)",
  },
  cardTags: { display: "flex", flexWrap: "wrap", gap: 8 },
  category: {
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "#4338ca",
    background: "#eef2ff",
    borderRadius: 999,
  },
  refundable: {
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "#166534",
    background: "#ecfdf3",
    borderRadius: 999,
  },
  cardTitle: { margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: "-0.01em" },
  description: {
    margin: 0,
    fontSize: 14.5,
    lineHeight: 1.55,
    color: "#5b6076",
    // Two lines, cut cleanly with an ellipsis rather than a hard crop.
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardFooter: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    // Pushes price to the bottom so it lines up across cards of any text length.
    marginTop: "auto",
    paddingTop: 12,
  },
  price: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" },
  courseType: { fontSize: 13, color: "#8b90a3" },
  skeletonCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 220,
    boxSizing: "border-box",
    padding: 22,
    background: "#ffffff",
    border: "1px solid #eef0f6",
    borderRadius: 16,
  },
  shimmer: {
    background: "#eef0f6",
    borderRadius: 6,
    animation: "skillpath-shimmer 1.4s ease-in-out infinite",
  },
  panel: {
    maxWidth: 460,
    margin: "0 auto",
    padding: "36px 24px",
    textAlign: "center",
    background: "#fafbfd",
    border: "1px solid #e6e8f0",
    borderRadius: 16,
  },
  panelHeading: { margin: 0, fontSize: 18, fontWeight: 650 },
  panelBody: { margin: "8px 0 18px", fontSize: 14.5, lineHeight: 1.55, color: "#5b6076" },
  button: {
    padding: "11px 22px",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#ffffff",
    background: "#4f46e5",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  buttonQuiet: {
    padding: "11px 22px",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "inherit",
    color: "#0f1222",
    background: "#ffffff",
    border: "1px solid #e6e8f0",
    borderRadius: 10,
    cursor: "pointer",
  },
  resultCount: { margin: "20px 0 0", fontSize: 14, color: "#8b90a3", textAlign: "center" },
}

addPropertyControls(CoursesSection, {
  // Every designer changes the heading first. Nothing else comes close.
  title: {
    type: ControlType.String,
    title: "Heading",
    defaultValue: "Courses built to be finished",
    placeholder: "Section heading",
  },
  // The one setting that changes behaviour rather than looks. When the country
  // endpoint is down, this decides what currency every visitor sees, so it
  // belongs to whoever owns the page and not to whoever edits the code.
  fallbackCountry: {
    type: ControlType.Enum,
    title: "Fallback",
    defaultValue: "IN",
    options: ["IN", "US"],
    optionTitles: ["Rupees", "US Dollars"],
    displaySegmentedControl: true,
  },
})
