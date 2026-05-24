import { InternalLogger, resolveDebugOption } from "@tanstack/ai/adapter-internals"
import {
  EXTRACT_PROMPT,
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
              content: EXTRACT_PROMPT,
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
  return data.itineraries ?? []
}
