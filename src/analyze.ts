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

  const data = result.data as FlightDataOutput
  return (data.itineraries ?? []).map(validateRoundTrip)
}

// If the final inbound destination doesn't match the first outbound origin,
// the traveller never returns home — treat it as one-way.
function validateRoundTrip(itinerary: FlightItinerary): FlightItinerary {
  if (!itinerary.inbound || itinerary.inbound.length === 0) return itinerary

  const firstOutboundOrigin = itinerary.outbound[0]?.origin
  const lastInboundDestination = itinerary.inbound[itinerary.inbound.length - 1]?.destination

  if (!firstOutboundOrigin || firstOutboundOrigin !== lastInboundDestination) {
    return { ...itinerary, inbound: null }
  }

  return itinerary
}
