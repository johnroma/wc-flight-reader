export interface FlightSegment {
  flightNumber: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
}

export interface FlightItinerary {
  price: number | null
  currency: string | null
  segments: FlightSegment[]
}

// Wrapped in an object so both Gemini and OpenAI structured output work
// reliably — some providers reject a top-level array schema.
export interface FlightDataOutput {
  itineraries: FlightItinerary[]
}

export const FLIGHT_DATA_SCHEMA = {
  type: "object",
  properties: {
    itineraries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          price: { type: "number", nullable: true },
          currency: { type: "string", nullable: true },
          segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                flightNumber: { type: "string" },
                origin: { type: "string" },
                destination: { type: "string" },
                departureAt: { type: "string" },
                arrivalAt: { type: "string" },
              },
              required: [
                "flightNumber",
                "origin",
                "destination",
                "departureAt",
                "arrivalAt",
              ],
            },
          },
        },
        required: ["price", "currency", "segments"],
      },
    },
  },
  required: ["itineraries"],
}

export function buildExtractPrompt(todayISO: string): string {
  return `You are a flight data extractor. Today's date is ${todayISO}. Analyse this flight screenshot or booking confirmation image and extract every visible itinerary option.

For each option return:
- price: total numeric price (null if not visible)
- currency: 3-letter ISO 4217 code e.g. "USD", "EUR", "SEK" (null if not visible)
- segments: every individual flight leg in travel order, each with:
  - flightNumber: carrier code + number e.g. "SK945", "AA123"
  - origin: 3-letter IATA airport code e.g. "ARN", "JFK"
  - destination: 3-letter IATA airport code
  - departureAt: ISO 8601 datetime e.g. "2026-06-01T10:30:00" — if the year is not shown, infer the nearest future year relative to today
  - arrivalAt: ISO 8601 datetime — same year-inference rule applies

Include all itinerary options visible. Use null for any field that cannot be determined.`
}
