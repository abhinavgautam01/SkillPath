# Skillpath

Landing page for a fake learning platform. The only part that matters is the
courses section, which is a Framer code component that reads two live endpoints.

`src/components/CoursesSection.jsx` is the deliverable. It is self-contained and
pastes into Framer unmodified. The hero and footer here are stand-ins for what
gets built on the Framer canvas.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run verify   # 27 assertions against the component
npm run lint
npm run build
```

## The API

Base URL `https://syncsphere-hiv6.onrender.com`, both endpoints GET, no auth.

- `/assignment/course-data` returns 5 to 10 courses, count varies per call
- `/assignment/country-code` returns `IN` or `US`, flips between calls

Roughly one request in three fails on purpose. Measured over 24 calls: 63%
succeeded on a single attempt, 96% with three attempts. Observed failure codes
were 404, 500 and 503.

## Decisions worth knowing about

**`res.ok` is checked before parsing.** A failed response is still valid JSON,
for example `{"detail":"gg"}` on a 500. Without the status check `res.json()`
resolves happily and hands an object to code expecting an array, and the section
renders blank instead of erroring.

**`Promise.allSettled`, not `Promise.all`.** The two calls are independent.
`all` would reject the pair the moment the country call fails, throwing away a
course list that arrived fine.

**Every failure is retried, three attempts, 350ms then 700ms.** Normally a 404
is not worth repeating. Here the API injects them at random, so the status says
nothing about whether the resource really exists. Retrying is safe because GET
is the only method used and nothing mutates server state.

**When the country call fails, cards still render.** Prices fall back to the
currency set in the `Fallback` property control and a notice tells the visitor
we could not confirm their region. Hiding the section or showing a bare number
would both be worse.

**The visitor can override the currency.** The toolbar has an INR / USD toggle.
The country endpoint still decides the default, so the assignment's premise
holds. The manual choice lives in its own piece of state rather than overwriting
the detected value, which keeps three sources in a clear order of precedence:
visitor choice, then detected country, then the fallback control. Choosing a
currency also retires the "we could not confirm your region" notice, since it is
only noise once the visitor has decided for themselves.

**Sorting reads whichever price is on screen.** With INR active it sorts on
`pricePaise`, with USD on `priceUsdCents`. The two orderings are not guaranteed
to agree, so sorting one field while displaying the other would render a list
that visibly is not in order. Switching currency re-sorts.

**Prices divide by 100.** `pricePaise` and `priceUsdCents` are both minor units,
so 199900 paise is ₹1,999 and 3999 cents is $39.99. `Intl.NumberFormat` does the
grouping because Indian digits group 2-2-3 above a thousand, not 3-3-3.

**Columns come from a `ResizeObserver` on the section, not media queries.**
Inline styles cannot hold media queries inside a Framer code component, and
measuring the component's own box rather than the viewport means the grid still
behaves if the section is dropped into a narrow column. Border-box width is
used, not `contentRect`, because `contentRect` subtracts the section's own 24px
padding and would put every breakpoint 48px out of step.

**Extra field on each card is `mainCategory`,** plus `courseType` next to the
price. A learner scans for the subject. `mangoId` and `courseCode` are internal.

## Property controls

| Control | Type | Why |
| --- | --- | --- |
| Heading | String | The first thing anyone editing the page wants to change |
| Fallback | Enum, Rupees or Dollars | Decides the currency every visitor sees when the country endpoint is down, which is a page-owner decision rather than a code one |

## States

Loading shows skeleton cards in the same grid, so nothing shifts when data
lands. Error shows what went wrong in plain language plus a retry button. Empty
covers both an empty catalogue and a search that matches nothing. Success
renders the grid.

## Local dev shim

The component imports from `framer` like any real code component.
`vite.config.js` aliases that to `src/lib/framer-shim.js` so the exact same file
runs locally and in Framer with no edits.

## Tests

`npm run verify` bundles the component, then renders it in jsdom with
`ResizeObserver` and `fetch` stubbed, so every width and every failure mode is
forced deterministically rather than waiting on a flaky API. 38 assertions
covering the 3/2/1 breakpoints including their exact boundaries, both
currencies, all four states, the country-down-courses-up path, the manual
currency switch, that a transient failure really is retried, and that sorting
follows the active currency (using a fixture whose rupee and dollar orderings
deliberately disagree).
