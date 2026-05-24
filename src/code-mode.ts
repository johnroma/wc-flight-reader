import { toolDefinition } from "@tanstack/ai"
import { createCodeMode } from "@tanstack/ai-code-mode"
import { createQuickJSIsolateDriver } from "@tanstack/ai-isolate-quickjs"
import { codeModeWithSkills } from "@tanstack/ai-code-mode-skills"
import { z } from "zod"
import { analyzeFlightImage } from "./analyze.js"
import { createLocalStorageSkillStorage } from "./skill-storage.js"
import type { AnyTextAdapter, ModelMessage } from "@tanstack/ai"
import type { SkillStorage } from "@tanstack/ai-code-mode-skills"

export { createLocalStorageSkillStorage } from "./skill-storage.js"
export type { SkillStorage } from "@tanstack/ai-code-mode-skills"

// Duck-typed adapter: Gemini and OpenAI adapters both satisfy this.
interface AnalysisAdapter extends AnyTextAdapter {
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredOutput(opts: any): Promise<{ data: unknown; rawText: string }>
}

const FlightImageInput = z.object({
  base64: z.string().describe("Base64-encoded image data (no data-URL prefix)"),
  mimeType: z
    .enum(["image/png", "image/jpeg", "image/webp"])
    .describe("MIME type of the image"),
})

const FlightSegment = z.object({
  flightNumber: z.string(),
  origin: z.string().describe("3-letter IATA code"),
  destination: z.string().describe("3-letter IATA code"),
  departureAt: z.string().describe("ISO 8601 datetime"),
  arrivalAt: z.string().describe("ISO 8601 datetime"),
})

const FlightDataOutput = z.object({
  itineraries: z.array(
    z.object({
      price: z.number().nullable(),
      currency: z.string().nullable().describe("ISO 4217 code"),
      outbound: z.array(FlightSegment).describe("Outgoing legs in departure order"),
      inbound: z.array(FlightSegment).nullable().describe("Return legs in departure order, null for one-way"),
    }),
  ),
})

function buildAnalyzeTool(adapter: AnalysisAdapter) {
  return toolDefinition({
    name: "analyzeFlightImage",
    description:
      "Analyze a flight screenshot and return structured itinerary data. " +
      "Call with Promise.all to process multiple screenshots in parallel.",
    inputSchema: FlightImageInput,
    outputSchema: FlightDataOutput,
  }).server(async ({ base64, mimeType }) => {
    const itineraries = await analyzeFlightImage(base64, mimeType, adapter)
    return { itineraries }
  })
}

export interface FlightCodeModeOptions {
  timeout?: number
}

/**
 * Basic Code Mode setup for flight image analysis.
 * Returns `{ tool, systemPrompt }` to pass to `chat()`.
 *
 * Enables parallel multi-image analysis via `Promise.all` in generated code.
 *
 * @example
 * ```ts
 * const adapter = createGeminiChat('gemini-3.1-flash-lite', apiKey)
 * const { tool, systemPrompt } = createFlightCodeMode(adapter)
 *
 * chat({
 *   adapter,
 *   systemPrompts: [systemPrompt],
 *   tools: [tool],
 *   messages,
 * })
 * ```
 */
export function createFlightCodeMode(adapter: AnalysisAdapter, options: FlightCodeModeOptions = {}) {
  const driver = createQuickJSIsolateDriver()
  return createCodeMode({
    driver,
    tools: [buildAnalyzeTool(adapter)],
    timeout: options.timeout ?? 30_000,
  })
}

export interface FlightCodeModeWithSkillsOptions extends FlightCodeModeOptions {
  skillStorage?: SkillStorage
  selectionAdapter?: AnyTextAdapter
  maxSkillsInContext?: number
}

/**
 * Code Mode with persistent localStorage Skills.
 * The model can register skills after successful extractions, which are
 * re-used in future sessions — saving tokens on repeated screenshot sources.
 *
 * @example
 * ```ts
 * const adapter = createGeminiChat('gemini-3.1-flash-lite', apiKey)
 * const { toolsRegistry, systemPrompt } = await createFlightCodeModeWithSkills(
 *   adapter,
 *   messages,
 * )
 *
 * chat({
 *   adapter,
 *   systemPrompts: [systemPrompt],
 *   toolRegistry: toolsRegistry,
 *   messages,
 * })
 * ```
 */
export async function createFlightCodeModeWithSkills(
  adapter: AnalysisAdapter,
  messages: ModelMessage[],
  options: FlightCodeModeWithSkillsOptions = {},
) {
  const driver = createQuickJSIsolateDriver()
  const storage = options.skillStorage ?? createLocalStorageSkillStorage()

  return codeModeWithSkills({
    config: {
      driver,
      tools: [buildAnalyzeTool(adapter)],
      timeout: options.timeout ?? 30_000,
    },
    adapter: options.selectionAdapter ?? adapter,
    skills: {
      storage,
      maxSkillsInContext: options.maxSkillsInContext ?? 3,
    },
    messages,
  })
}
