import { afterEach, describe, expect, it, vi } from "vitest"
import {
  analyzeFlightImage,
  analyzeSubscriptionFlightImage,
} from "../src/analyze.js"
import type { FlightItinerary } from "../src/schema.js"

const segment = {
  flightNumber: "EK158",
  origin: "ARN",
  destination: "DXB",
  departureAt: "2026-08-04T15:35:00",
  arrivalAt: "2026-08-05T00:10:00",
}

const itinerary = (overrides: Partial<FlightItinerary> = {}): FlightItinerary => ({
  price: null,
  currency: null,
  outbound: [segment],
  inbound: null,
  ...overrides,
})

function completion(data: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(data) } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe("analyzeSubscriptionFlightImage", () => {
  it("sends the subscription-llm contract without a browser API key or model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion({ itineraries: [itinerary({ inbound: [] })] }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await analyzeSubscriptionFlightImage(
      "aW1hZ2U=",
      "image/png",
      "https://app.example/api/subscription-llm/v1/chat/completions",
      "",
      undefined,
      "2026-07-21",
    )

    expect(result).toEqual([itinerary()])
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://app.example/api/subscription-llm/v1/chat/completions")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "content-type": "application/json" })

    const body = JSON.parse(init.body as string)
    expect(body.model).toBeUndefined()
    expect(body.messages[0].content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Today's date is 2026-07-21"),
      },
      {
        type: "image",
        image: { data: "aW1hZ2U=", mimeType: "image/png" },
      },
    ])
    expect(body.outputSchema.properties.itineraries).toBeDefined()
  })

  it("forwards an optional service token and explicit model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion({ itineraries: [] }))
    vi.stubGlobal("fetch", fetchMock)

    await analyzeSubscriptionFlightImage(
      "aW1hZ2U=",
      "image/jpeg",
      "https://app.example/api/subscription-llm/v1/chat/completions",
      "service-token",
      "supported-model",
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer service-token",
    })
    expect(JSON.parse(init.body as string).model).toBe("supported-model")
  })

  it("preserves a valid return trip and removes an invalid one", async () => {
    const matchingInbound = {
      ...segment,
      flightNumber: "EK349",
      origin: "DXB",
      destination: "ARN",
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion({ itineraries: [itinerary({ inbound: [matchingInbound] })] }))
      .mockResolvedValueOnce(completion({ itineraries: [itinerary({ inbound: [segment] })] }))
    vi.stubGlobal("fetch", fetchMock)

    const valid = await analyzeSubscriptionFlightImage("x", "image/png", "https://service", "")
    const invalid = await analyzeSubscriptionFlightImage("x", "image/png", "https://service", "")

    expect(valid[0]?.inbound).toEqual([matchingInbound])
    expect(invalid[0]?.inbound).toBeNull()
  })

  it("uses a structured service error and has a safe fallback for non-JSON errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "subscription token rejected" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("gateway unavailable", { status: 502 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(analyzeSubscriptionFlightImage("x", "image/png", "https://service", ""))
      .rejects.toThrow("subscription token rejected")
    await expect(analyzeSubscriptionFlightImage("x", "image/png", "https://service", ""))
      .rejects.toThrow("Subscription service failed (502)")
  })

  it("rejects a missing or malformed structured completion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(analyzeSubscriptionFlightImage("x", "image/png", "https://service", ""))
      .rejects.toThrow("Subscription service returned no completion content")
    await expect(analyzeSubscriptionFlightImage("x", "image/png", "https://service", ""))
      .rejects.toThrow("Subscription service returned invalid structured output")
  })
})

describe("analyzeFlightImage", () => {
  it("retains the direct-provider request format and normalizes an empty inbound array", async () => {
    const structuredOutput = vi.fn().mockResolvedValue({
      data: { itineraries: [itinerary({ inbound: [] })] },
      rawText: "",
    })

    const result = await analyzeFlightImage(
      "aW1hZ2U=",
      "image/webp",
      { model: "gemini-test", structuredOutput },
      "2026-07-21",
    )

    expect(result).toEqual([itinerary()])
    expect(structuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        outputSchema: expect.any(Object),
        chatOptions: expect.objectContaining({ model: "gemini-test" }),
      }),
    )
  })
})
