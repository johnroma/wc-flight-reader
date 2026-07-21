import { afterEach, describe, expect, it, vi } from "vitest"
import { FlightReader } from "../src/flight-reader.js"

function clipboardPaste(items: Array<{ type: string; getAsFile: () => File | null }>) {
  const event = new Event("paste") as ClipboardEvent
  Object.defineProperty(event, "clipboardData", {
    value: { items },
  })
  document.dispatchEvent(event)
}

async function reader(): Promise<FlightReader> {
  const element = new FlightReader()
  document.body.append(element)
  await element.updateComplete
  return element
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("FlightReader input routing", () => {
  it("routes an accepted clipboard image to processing", async () => {
    const element = await reader()
    const file = new File(["image"], "flight.png", { type: "image/png" })
    const process = vi.spyOn(element as never, "_process").mockResolvedValue(undefined)

    clipboardPaste([{ type: "image/png", getAsFile: () => file }])

    expect(process).toHaveBeenCalledWith(file)
  })

  it("extracts a pasted image through the subscription service without an API key", async () => {
    class TestFileReader {
      result = "data:image/png;base64,aW1hZ2U="
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL() {
        this.onload?.()
      }
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  itineraries: [
                    {
                      price: null,
                      currency: null,
                      outbound: [],
                      inbound: null,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("FileReader", TestFileReader)
    vi.stubGlobal("fetch", fetchMock)

    const element = await reader()
    element.provider = "subscription"
    element.subscriptionUrl = "https://app.example/api/subscription-llm/v1/chat/completions"
    const received = vi.fn()
    element.addEventListener("flight-data", received)

    const file = new File(["image"], "flight.png", { type: "image/png" })
    clipboardPaste([{ type: "image/png", getAsFile: () => file }])

    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(element.subscriptionUrl)
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "content-type": "application/json",
    })
    expect((element as unknown as { _status: string })._status).toBe("done")
  })

  it("ignores clipboard text and unsupported image formats", async () => {
    const element = await reader()
    const process = vi.spyOn(element as never, "_process").mockResolvedValue(undefined)

    clipboardPaste([
      { type: "text/plain", getAsFile: () => null },
      { type: "image/gif", getAsFile: () => new File(["gif"], "flight.gif", { type: "image/gif" }) },
    ])

    expect(process).not.toHaveBeenCalled()
  })

  it("removes its document clipboard listener when disconnected", async () => {
    const element = await reader()
    const process = vi.spyOn(element as never, "_process").mockResolvedValue(undefined)
    const file = new File(["image"], "flight.png", { type: "image/png" })

    element.remove()
    clipboardPaste([{ type: "image/png", getAsFile: () => file }])

    expect(process).not.toHaveBeenCalled()
  })

  it("rejects an unknown provider instead of silently falling back to Gemini", async () => {
    const element = await reader()
    element.provider = "not-a-provider" as never
    const process = element as unknown as { _process(file: File): Promise<void> }

    await process._process(new File(["image"], "flight.png", { type: "image/png" }))

    expect((element as unknown as { _status: string })._status).toBe("error")
    expect((element as unknown as { _error: string })._error).toBe(
      "Unsupported provider: not-a-provider",
    )
    expect(element.shadowRoot?.textContent).toContain("Unsupported provider: not-a-provider")
  })

  it("requires an endpoint only for the subscription provider", async () => {
    const element = await reader()
    element.provider = "subscription"
    const subscription = element as unknown as {
      _analyzeWithSubscription(base64: string, mimeType: string): Promise<unknown>
    }

    await expect(subscription._analyzeWithSubscription("aW1hZ2U=", "image/png"))
      .rejects.toThrow("Set subscription-url to the subscription-llm /v1/chat/completions endpoint")
  })
})
