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

| Property      | Attribute      | Type                    | Default                  | Description                                                      |
|---------------|----------------|------------------------|--------------------------|------------------------------------------------------------------|
| `provider`    | `provider`     | `"gemini" \| "openai" \| "subscription"` | `"gemini"` | AI transport to use |
| `apiKey`      | —              | `string`               | `""`                     | Provider API key, or optional subscription service Bearer token; set as a JS property |
| `geminiModel` | `gemini-model` | `string`               | `"gemini-3.1-flash-lite"` | Gemini model to use |
| `openaiModel` | `openai-model` | `string`               | `"gpt-5-nano"`           | OpenAI model to use |
| `model`       | `model`        | `string`               | `""`                     | Provider model override. Leave empty for Codex/ChatGPT automatic selection. |
| `proxyUrl`    | `proxy-url`    | `string`               | `""`                     | Existing Gemini/OpenAI SDK proxy base URL. Also an alias for `subscriptionUrl`. |
| `subscriptionUrl` | `subscription-url` | `string` | `""` | `subscription-llm` `/v1/chat/completions` endpoint; required for `provider="subscription"`. |

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
  outbound: FlightSegment[] // outgoing legs, in departure order
  inbound: FlightSegment[] | null // return legs, or null for one-way
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

Uses `gpt-5-nano` by default. Get a key at [platform.openai.com](https://platform.openai.com).

```js
el.provider = 'openai'
el.apiKey = 'sk-...'
```

### Codex subscription

Use a locally running [`subscription-llm`](https://github.com/johnroma/subscription-llm) service. The component uses its vision + structured-output contract directly; it does not expose a Codex or OpenAI key in the browser.

```js
el.provider = 'subscription'
el.subscriptionUrl = 'http://127.0.0.1:8789/v1/chat/completions'
// Only set this when SUBSCRIPTION_LLM_TOKEN is configured on the service:
// el.apiKey = 'local-service-token'
```

Leave `model` unset for a ChatGPT-backed Codex account, which selects its own supported model.

## Security

Gemini and OpenAI API keys are used directly from the browser. For production, route them through your own backend. `subscription-llm` should remain loopback-only unless you configure its Bearer token and network exposure deliberately.

## License

MIT
