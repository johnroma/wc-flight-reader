# wc-flight-reader

A self-contained web component that extracts structured itinerary data from a flight screenshot. Drop, click, or paste an image — the component calls Gemini or OpenAI vision, parses the result, and fires a `flight-data` event with typed itinerary objects.

## Install

```bash
npm install wc-flight-reader
# or
pnpm add wc-flight-reader
```

No peer dependencies are required. The component is fully self-contained (Lit and the AI adapters are bundled).

## Quick start

```html
<!-- Plain HTML -->
<script type="module">
  import 'wc-flight-reader'
</script>

<flight-reader id="reader" provider="gemini"></flight-reader>

<script>
  const reader = document.getElementById('reader')
  reader.apiKey = 'YOUR_GEMINI_API_KEY'

  reader.addEventListener('flight-data', (e) => {
    console.log(e.detail) // FlightItinerary[]
  })
</script>
```

```tsx
// React (dynamically imported to avoid SSR)
import { useEffect, useRef } from 'react'

useEffect(() => {
  import('wc-flight-reader')
}, [])

// Set apiKey as a property (not an attribute) after the element upgrades
useEffect(() => {
  const el = ref.current
  if (el) el.apiKey = yourKey
}, [yourKey])

// <flight-reader ref={ref} provider="gemini" />
```

## Properties

| Property   | Attribute   | Type                  | Default              | Description                                              |
|------------|-------------|----------------------|----------------------|----------------------------------------------------------|
| `provider` | `provider`  | `"gemini" \| "openai"` | `"gemini"`           | Which AI provider to use                                 |
| `apiKey`   | —           | `string`             | `""`                 | API key — set as a JS property, not an HTML attribute    |
| `model`    | `model`     | `string`             | `"gemini-2.0-flash"` / `"gpt-4o-mini"` | Override the default model for the selected provider |
| `proxyUrl` | `proxy-url` | `string`             | `""`                 | Optional base URL for proxying AI requests               |

> **Note:** `apiKey` is intentionally not reflected as an HTML attribute to avoid it appearing in the DOM. Always set it via JavaScript: `el.apiKey = key`.

## Events

### `flight-data`

Fired after a successful extraction.

```ts
import type { FlightItinerary } from 'wc-flight-reader/types'

el.addEventListener('flight-data', (e: CustomEvent<FlightItinerary[]>) => {
  const itineraries = e.detail
})
```

#### `FlightItinerary`

```ts
interface FlightItinerary {
  price: number | null      // total price shown in the screenshot
  currency: string | null   // ISO 4217 code e.g. "USD", "SEK"
  segments: FlightSegment[]
}

interface FlightSegment {
  flightNumber: string      // e.g. "SK945"
  origin: string            // IATA code e.g. "ARN"
  destination: string       // IATA code e.g. "JFK"
  departureAt: string       // ISO 8601 e.g. "2026-06-01T10:30:00"
  arrivalAt: string         // ISO 8601
}
```

## Image input

The component accepts input three ways:

- **Click** — opens a file picker (PNG, JPEG, WEBP)
- **Drag and drop** — drop an image onto the component
- **Paste** — `Ctrl/Cmd+V` anywhere on the page while the component is mounted

## TypeScript

Types are exported from the package:

```ts
import type { FlightItinerary, FlightSegment } from 'wc-flight-reader/types'
```

## Providers

### Gemini (default)

Uses `gemini-2.0-flash`. Get a key at [aistudio.google.com](https://aistudio.google.com).

```js
el.provider = 'gemini'
el.apiKey = 'AIza...'
```

### OpenAI

Uses `gpt-4o-mini`. Get a key at [platform.openai.com](https://platform.openai.com).

```js
el.provider = 'openai'
el.apiKey = 'sk-...'
```

## Security

API keys are used directly from the browser. For production, set `proxy-url` to route requests through your own backend so keys are never exposed to the client.

## License

MIT
