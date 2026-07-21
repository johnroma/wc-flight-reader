import { LitElement, html, css } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { createGeminiChat } from "@tanstack/ai-gemini"
import { createOpenaiChat } from "@tanstack/ai-openai"
import { analyzeFlightImage, analyzeSubscriptionFlightImage } from "./analyze.js"
import type { FlightItinerary } from "./schema.js"

const PROVIDERS = ["gemini", "openai", "subscription"] as const
type Provider = (typeof PROVIDERS)[number]
type Status = "idle" | "loading" | "done" | "error"

const DEFAULT_MODELS: Record<Exclude<Provider, "subscription">, string> = {
  gemini: "gemini-3.1-flash-lite",
  openai: "gpt-5-nano",
}

const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]

@customElement("flight-reader")
export class FlightReader extends LitElement {
  @property({ type: String }) provider: Provider = "gemini"
  @property({ type: String }) model = ""
  @property({ type: String, attribute: "gemini-model" }) geminiModel = DEFAULT_MODELS.gemini
  @property({ type: String, attribute: "openai-model" }) openaiModel = DEFAULT_MODELS.openai
  @property({ type: String, attribute: "proxy-url" }) proxyUrl = ""
  @property({ type: String, attribute: "subscription-url" }) subscriptionUrl = ""

  // attribute: false — reactive but never reflected to DOM attribute. For the
  // subscription provider this is the optional service Bearer token.
  @property({ type: String, attribute: false }) apiKey = ""

  @state() private _status: Status = "idle"
  @state() private _count = 0
  @state() private _error = ""
  @state() private _isDragover = false

  private readonly _boundPaste = this._onPaste.bind(this)

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("paste", this._boundPaste)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener("paste", this._boundPaste)
  }

  private _resolvedModel(): string {
    if (this.model) return this.model
    return this.provider === "openai" ? this.openaiModel : this.geminiModel
  }

  private _buildAdapter() {
    const model = this._resolvedModel()
    // In proxy mode the real key is added server-side; SDKs reject empty string so use a placeholder.
    const key = this.apiKey || (this.proxyUrl ? "proxy" : "")

    if (this.provider === "openai") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createOpenaiChat(model as any, key, { dangerouslyAllowBrowser: true, ...(this.proxyUrl ? { baseURL: this.proxyUrl } : {}) })
    }

    if (this.provider === "gemini") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createGeminiChat(model as any, key, this.proxyUrl ? { httpOptions: { baseUrl: this.proxyUrl } } : undefined)
    }

    throw new Error(`Unsupported provider: ${this.provider}`)
  }

  private _subscriptionEndpoint(): string {
    return this.subscriptionUrl || this.proxyUrl
  }

  private async _process(file: File) {
    if (!PROVIDERS.includes(this.provider)) {
      this._error = `Unsupported provider: ${this.provider}`
      this._status = "error"
      return
    }

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      this._error = `Unsupported format: ${file.type}. Use PNG, JPEG or WEBP.`
      this._status = "error"
      return
    }

    this._status = "loading"
    this._error = ""

    try {
      const base64 = await this._toBase64(file)
      const itineraries: FlightItinerary[] = this.provider === "subscription"
        ? await this._analyzeWithSubscription(base64, file.type)
        : await analyzeFlightImage(base64, file.type, this._buildAdapter())

      this._count = itineraries.length
      this._status = "done"

      this.dispatchEvent(
        new CustomEvent("flight-data", {
          detail: itineraries,
          bubbles: true,
          composed: true,
        }),
      )
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Analysis failed."
      // Strip verbose JSON API error bodies — show first meaningful sentence only
      try {
        const parsed = JSON.parse(raw)
        this._error = parsed?.error?.message ?? raw
      } catch {
        this._error = raw.split("\n")[0]?.slice(0, 120) ?? raw
      }
      this._status = "error"
    }
  }

  private async _analyzeWithSubscription(base64: string, mimeType: string): Promise<FlightItinerary[]> {
    const endpoint = this._subscriptionEndpoint()
    if (!endpoint) {
      throw new Error("Set subscription-url to the subscription-llm /v1/chat/completions endpoint")
    }

    // An omitted model lets a ChatGPT-backed Codex account select its default.
    return analyzeSubscriptionFlightImage(base64, mimeType, endpoint, this.apiKey, this.model || undefined)
  }

  private _toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip the data URL prefix: "data:image/png;base64,"
        resolve(result.split(",")[1] ?? "")
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  private _onDrop(e: DragEvent) {
    e.preventDefault()
    this._isDragover = false
    const file = e.dataTransfer?.files[0]
    if (file) this._process(file)
  }

  private _onDragover(e: DragEvent) {
    e.preventDefault()
    this._isDragover = true
  }

  private _onDragleave() {
    this._isDragover = false
  }

  private _onClick() {
    this.shadowRoot?.querySelector<HTMLInputElement>("#file-input")?.click()
  }

  private _onFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) this._process(file)
  }

  private _onPaste(e: ClipboardEvent) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
      ACCEPTED_MIME_TYPES.includes(i.type),
    )
    const file = item?.getAsFile()
    if (file) this._process(file)
  }

  private _statusContent() {
    if (this._status === "loading") {
      return html`<span class="status loading">${spinner} Analysing…</span>`
    }
    if (this._status === "done") {
      return html`<span class="status done">✓ Found ${this._count} itinerar${this._count === 1 ? "y" : "ies"}</span>`
    }
    if (this._status === "error") {
      return html`<span class="status error">✗ ${this._error}</span>`
    }
    return html`<span class="status hint">Drop, click or paste a flight screenshot</span>`
  }

  protected render() {
    return html`
      <div
        class="zone ${this._isDragover ? "dragover" : ""}"
        @drop=${this._onDrop}
        @dragover=${this._onDragover}
        @dragleave=${this._onDragleave}
        @click=${this._onClick}
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 17l2-2 4 4L17 7l2 2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 3l-6 6" stroke-linecap="round"/>
        </svg>
        ${this._statusContent()}
        <input
          id="file-input"
          type="file"
          accept="${ACCEPTED_MIME_TYPES.join(",")}"
          hidden
          @change=${this._onFileInput}
        />
      </div>
    `
  }

  static readonly styles = css`
    :host {
      display: block;
      font-family: system-ui, sans-serif;
    }

    .zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 32px 24px;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      min-height: 120px;
      box-sizing: border-box;
    }

    .zone:hover,
    .zone.dragover {
      border-color: #6366f1;
      background: #f5f3ff;
    }

    .icon {
      width: 32px;
      height: 32px;
      color: #94a3b8;
    }

    .status {
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .hint { color: #94a3b8; }
    .loading { color: #6366f1; }
    .done { color: #16a34a; }
    .error { color: #dc2626; }
  `
}

const spinner = html`<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="animation:spin 0.8s linear infinite"><style>@keyframes spin{to{transform:rotate(360deg)}}</style><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`

declare global {
  interface HTMLElementTagNameMap {
    "flight-reader": FlightReader
  }
}
