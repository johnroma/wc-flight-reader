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
  /** Outgoing legs A→B, including connections, in departure order. */
  outbound: FlightSegment[]
  /** Return legs B→A, including connections, in departure order. Null for one-way or when the return is not shown. */
  inbound: FlightSegment[] | null
}

// Wrapped in an object so both Gemini and OpenAI structured output work
// reliably — some providers reject a top-level array schema.
export interface FlightDataOutput {
  itineraries: FlightItinerary[]
}

const SEGMENT_SCHEMA = {
  type: "object",
  properties: {
    flightNumber: { type: "string" },
    origin: { type: "string" },
    destination: { type: "string" },
    departureAt: { type: "string" },
    arrivalAt: { type: "string" },
  },
  required: ["flightNumber", "origin", "destination", "departureAt", "arrivalAt"],
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
          outbound: { type: "array", items: SEGMENT_SCHEMA },
          inbound: { type: "array", nullable: true, items: SEGMENT_SCHEMA },
        },
        required: ["price", "currency", "outbound", "inbound"],
      },
    },
  },
  required: ["itineraries"],
}

export function buildExtractPrompt(todayISO: string): string {
  return `You are a flight data extractor. Today's date is ${todayISO}. Analyse this flight screenshot or booking confirmation image and extract every visible itinerary option.

Each itinerary option has two separate arrays of flight legs:
- outbound: ONLY the legs travelling in the OUTGOING direction (origin → destination), including connections, in departure order
- inbound: ONLY the legs travelling in the RETURN direction (destination → origin), including connections, in departure order — use null if this is a one-way trip or if the return leg is not shown in this image

IMPORTANT: Never mix outbound and inbound legs into the same array. A connection like ARN→LHR→JFK is two outbound legs, not one outbound + one inbound.

For each option also return:
- price: total numeric price shown for this option (null if not visible)
- currency: 3-letter ISO 4217 code e.g. "USD", "EUR", "SEK" (null if not visible)

Each flight leg has:
- flightNumber: carrier code + number e.g. "SK945", "AA123"
- origin: 3-letter IATA airport code e.g. "ARN", "JFK"
- destination: 3-letter IATA airport code
- departureAt: ISO 8601 datetime e.g. "2026-06-01T10:30:00" — if the year is not shown, infer the nearest future year relative to today
- arrivalAt: ISO 8601 datetime — same year-inference rule applies

Include all itinerary options visible. Use null for any field that cannot be determined.`
}
