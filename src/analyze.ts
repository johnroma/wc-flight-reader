import { InternalLogger, resolveDebugOption } from "@tanstack/ai/adapter-internals"
import {
  buildExtractPrompt,
  FLIGHT_DATA_SCHEMA,
  type FlightDataOutput,
  type FlightItinerary,
} from "./schema.js"

// Duck-typed to avoid fighting model-literal type constraints from both adapters
interface StructuredAdapter {
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredOutput(opts: any): Promise<{ data: unknown; rawText: string }>
}

const logger: InternalLogger = resolveDebugOption(undefined)

export async function analyzeFlightImage(
  base64: string,
  mimeType: string,
  adapter: StructuredAdapter,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<FlightItinerary[]> {
  const result = await adapter.structuredOutput({
    chatOptions: {
      model: adapter.model,
      logger,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              content: buildExtractPrompt(today),
            },
            {
              type: "image",
              source: { type: "data", value: base64, mimeType },
            },
          ],
        },
      ],
    },
    outputSchema: FLIGHT_DATA_SCHEMA,
  })

  return itinerariesFrom(result.data)
}

/** Call the local subscription-llm service without exposing a provider API key. */
export async function analyzeSubscriptionFlightImage(
  base64: string,
  mimeType: string,
  endpoint: string,
  token: string,
  model?: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<FlightItinerary[]> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      ...(model ? { model } : {}),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractPrompt(today) },
            { type: "image", image: { data: base64, mimeType } },
          ],
        },
      ],
      outputSchema: FLIGHT_DATA_SCHEMA,
    }),
  })

  const payload = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : `Subscription service failed (${response.status})`
    throw new Error(message)
  }

  const content = isRecord(payload)
    && Array.isArray(payload.choices)
    && isRecord(payload.choices[0])
    && isRecord(payload.choices[0].message)
    && typeof payload.choices[0].message.content === "string"
    ? payload.choices[0].message.content
    : undefined

  if (!content) throw new Error("Subscription service returned no completion content")

  try {
    return itinerariesFrom(JSON.parse(content))
  } catch {
    throw new Error("Subscription service returned invalid structured output")
  }
}

function itinerariesFrom(data: unknown): FlightItinerary[] {
  const output = data as FlightDataOutput
  return (output.itineraries ?? []).map(validateRoundTrip)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// If the final inbound destination doesn't match the first outbound origin,
// the traveller never returns home — treat it as one-way.
function validateRoundTrip(itinerary: FlightItinerary): FlightItinerary {
  if (!itinerary.inbound || itinerary.inbound.length === 0) {
    return { ...itinerary, inbound: null }
  }

  // A lone "Return"-labelled card (e.g. only the homeward leg is visible) makes
  // the model file the legs under inbound with an empty outbound array. There is
  // no round-trip to validate — promote the legs to outbound so they survive.
  if (itinerary.outbound.length === 0) {
    return { ...itinerary, outbound: itinerary.inbound, inbound: null }
  }

  const firstOutboundOrigin = itinerary.outbound[0]?.origin
  const lastInboundDestination = itinerary.inbound[itinerary.inbound.length - 1]?.destination

  if (!firstOutboundOrigin || firstOutboundOrigin !== lastInboundDestination) {
    return { ...itinerary, inbound: null }
  }

  return itinerary
}
