---
name: google-flights
description: >
  Automate Google Flights search → screenshot → structured flight data extraction.
  Uses chrome-devtools MCP to navigate, fill the search form, and capture a
  screenshot, then feeds the image to analyzeFlightImage() from this project.
type: workflow
---

# google-flights skill

Automate a Google Flights search and extract structured itinerary data.

## What you need

- The chrome-devtools MCP tools (list_pages, navigate_page, fill, click, take_screenshot, wait_for)
- A running browser tab (open one with new_page if needed)
- An active Gemini or OpenAI adapter (from `createGeminiChat` or `createOpenaiChat`)

## Workflow

### 1. Open / reuse a browser tab

```
list_pages → if no suitable tab, use new_page
select_page with the chosen pageId
```

### 2. Navigate to Google Flights

```
navigate_page → https://www.google.com/travel/flights
wait_for → selector ".gws-flights__search-container" OR url contains "/travel/flights"
```

### 3. Fill origin and destination

Google Flights uses accessible inputs. Click the first input to activate it, clear it, then type:

```
click selector "[data-iata-pair]" or the first aria-label="Where from?" input
fill selector "input[aria-label='Where from?']" value "<ORIGIN CITY OR AIRPORT>"
wait_for → dropdown suggestion visible
click selector "[data-value='<IATA>']" in the autocomplete
```

Repeat for destination:
```
fill selector "input[aria-label='Where to?']" value "<DESTINATION>"
wait_for → autocomplete
click first autocomplete suggestion
```

### 4. Set dates

```
click selector "[data-input-id='startDate']"  # departure calendar
fill or click the target date cell
```

### 5. Run the search

```
click selector "button[aria-label='Search']" or the search button
wait_for → flight results: selector ".gws-flights-results__result-list" or similar
```

### 6. Take screenshot

```
take_screenshot → base64 PNG
```

Store the result: `{ base64, mimeType: "image/png" }`.

### 7. Analyze with analyzeFlightImage

Import and call from the project:

```typescript
import { analyzeFlightImage } from "./src/analyze.js"
import { createGeminiChat } from "@tanstack/ai-gemini"

const adapter = createGeminiChat(
  "gemini-3.1-flash-lite",
  process.env.GEMINI_API_KEY!,
)

const itineraries = await analyzeFlightImage(base64, "image/png", adapter)
console.log(JSON.stringify(itineraries, null, 2))
```

### 8. Return results

The `itineraries` array contains entries shaped like:

```typescript
{
  price: number | null,
  currency: string | null,    // "USD", "SEK", …
  segments: [{
    flightNumber: string,     // "SK945"
    origin: string,           // "ARN"
    destination: string,      // "JFK"
    departureAt: string,      // "2026-06-01T10:30:00"
    arrivalAt: string,
  }]
}
```

## Code Mode integration (token-efficient, parallel)

When using Code Mode + Skills (`createFlightCodeModeWithSkills`), the model can
register a `google_flights_extract` skill after a successful run. Subsequent calls
skip re-reasoning about the page layout and call the skill directly, saving tokens
and round-trips.

```typescript
import { createGeminiChat } from "@tanstack/ai-gemini"
import { createFlightCodeModeWithSkills } from "wc-flight-reader/code-mode"

const adapter = createGeminiChat("gemini-3.1-flash-lite", apiKey)
const { toolsRegistry, systemPrompt } = await createFlightCodeModeWithSkills(adapter, [])

// Pass toolsRegistry + systemPrompt to chat() alongside the screenshot tool
```

## Selector fallbacks

Google Flights updates its DOM frequently. If a selector fails, try:
- Broad: `button:has-text("Search")`, `input[placeholder*="From"]`
- Inspect with `take_snapshot` → find updated selectors
- Use `evaluate_script` to query by text content

## Tips

- Wait for results to fully render before screenshotting (look for price elements, not just the loading spinner)
- If prices aren't visible, scroll down or wait longer: `wait_for selector ".YMlIz"` (price class, may change)
- For round trips, the screenshot may show both outbound and return options — `analyzeFlightImage` returns all visible itineraries
