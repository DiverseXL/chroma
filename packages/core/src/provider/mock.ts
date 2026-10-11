import type {
  CompleteTextRequest,
  CompleteTextResult,
  CritiqueResult,
  EditImageRequest,
  GenerateImageRequest,
  ImageArtifactResult,
  ProviderAdapter,
  ScoreImageRequest,
} from "./adapter.js";
import {
  ProviderError,
  ProviderRateLimitError,
} from "./adapter.js";

/**
 * Configuration options for simulating failures and rate limits in MockAdapter.
 */
export interface MockAdapterConfig {
  /**
   * Number of transient failures to produce before succeeding on subsequent calls.
   */
  failuresBeforeSuccess?: number;

  /**
   * Interval at which to emit a ProviderRateLimitError (e.g. every Nth call).
   */
  rateLimitEvery?: number;

  /**
   * Configurable score returned by scoreImage (defaults to 0.8).
   */
  critiqueScore?: number;

  /**
   * Configurable issues returned by scoreImage.
   */
  critiqueIssues?: string[];
}

/**
 * Canned JSON payloads for completeText keyed by system prompt keyword.
 *
 * The selector inspects the system prompt for known keywords and returns the
 * corresponding fixed object. This is intentionally deterministic so test
 * assertions can rely on stable field names.
 */
const CANNED_JSON: Record<string, unknown> = {
  storyBible: {
    panelCount: 4,
    characters: [
      {
        name: "A traveler",
        description: "The central character in the brief",
        appearance: "A distinctive silhouette with practical clothing",
      },
    ],
    locations: [
      {
        name: "The setting",
        description: "A detailed location suited to the brief",
        timeOfDay: "late afternoon",
        atmosphere: "Atmospheric and cinematic",
      },
    ],
    visualStyle: {
      palette: "warm amber and deep indigo",
      lighting: "golden hour, soft directional shadows",
      mood: "cinematic, melancholic",
      medium: "digital painting",
      era: "contemporary",
    },
    overallArc: "The traveler moves from uncertainty toward discovery.",
  },
  planner: {
    nodes: [
      {
        id: "plan-0",
        kind: "PLAN",
        label: "Plan",
        inputs: {},
        outputs: ["storyboard"],
      },
      {
        id: "style-1",
        kind: "STYLE_ANALYSIS",
        label: "Style Analysis",
        inputs: { plan: "plan-0.storyboard" },
        outputs: ["style"],
      },
      {
        id: "prompt-panel-1",
        kind: "PROMPT_COMPILE",
        label: "Panel 1 Prompt",
        inputs: { style: "style-1.style" },
        outputs: ["prompt"],
      },
      {
        id: "img-panel-1",
        kind: "IMAGE_GENERATE",
        label: "Panel 1 Image",
        inputs: { prompt: "prompt-panel-1.prompt" },
        outputs: ["image"],
      },
      {
        id: "critique-1",
        kind: "CRITIQUE",
        label: "Panel 1 Critique",
        inputs: { image: "img-panel-1.image" },
        outputs: ["score"],
      },
      {
        id: "gate-1",
        kind: "GATE",
        label: "Panel 1 Gate",
        inputs: { critique: "critique-1.score" },
        outputs: ["decision"],
      },
      {
        id: "compose-final",
        kind: "COMPOSE",
        label: "Compose",
        inputs: { panel1: "img-panel-1.image" },
        outputs: ["final"],
      },
    ],
    edges: [
      { from: "plan-0", to: "style-1", fromPort: "storyboard", toPort: "plan" },
      { from: "style-1", to: "prompt-panel-1", fromPort: "style", toPort: "style" },
      { from: "prompt-panel-1", to: "img-panel-1", fromPort: "prompt", toPort: "prompt" },
      { from: "img-panel-1", to: "critique-1", fromPort: "image", toPort: "image" },
      { from: "critique-1", to: "gate-1", fromPort: "score", toPort: "critique" },
      { from: "img-panel-1", to: "compose-final", fromPort: "image", toPort: "panel1" },
    ],
  },
  style: {
    palette: "warm amber and deep indigo",
    lighting: "golden hour, soft directional shadows",
    mood: "cinematic, melancholic",
    medium: "digital painting",
    era: "contemporary",
    camera: "wide angle, shallow depth of field",
  },
  prompt: {
    prompt:
      "A cinematic wide-angle shot at golden hour showing an atmospheric landscape with warm amber tones, deep indigo shadows, and a shallow depth of field — digital painting style.",
  },
  critic: {
    score: 0.85,
    feedback: "Strong composition and lighting, minor colour fringing on the horizon.",
    issues: ["slight colour fringing on horizon"],
  },
  consistency: {
    score: 0.9,
    feedback: "Panels share consistent palette and lighting direction.",
    issues: [],
    driftedPanels: [],
  },
};

/**
 * Selects the appropriate canned JSON object based on keywords in the system prompt.
 *
 * @param system System prompt text.
 * @returns A canned JSON object that matches the keyword, or a generic default.
 */
function selectCannedJson(system = "", prompt = ""): unknown {
  const lower = system.toLowerCase();
  if (lower.includes("story architect")) {
    return CANNED_JSON.storyBible;
  }
  if (lower.includes("scene planner")) {
    const panelIndex = Number(prompt.match(/Panel index:\s*(\d+)/i)?.[1] ?? 1);
    const panelCount = Number(
      prompt.match(/Total panel count:\s*(\d+)/i)?.[1] ?? 4,
    );
    const subject = `Traveler crossing scene ${panelIndex}`;
    const action = "walks toward a distant landmark";
    return {
      panelIndex,
      sceneDescription: `The traveler walks toward a distant landmark in panel ${panelIndex}.`,
      subject,
      action,
      cameraAngle: "wide establishing shot",
      prompt:
        `A traveler walks toward a distant landmark in panel ${panelIndex} of ${panelCount}, ` +
        "framed in a wide establishing shot with warm amber colors and deep indigo shadows, " +
        "golden hour lighting, a cinematic melancholic mood, and a detailed digital painting finish.",
    };
  }
  if (lower.includes("planner") || lower.includes("plan")) {
    return CANNED_JSON.planner;
  }
  if (lower.includes("style")) {
    return CANNED_JSON.style;
  }
  if (lower.includes("prompt") || lower.includes("compile")) {
    return CANNED_JSON.prompt;
  }
  if (lower.includes("critic") || lower.includes("critique") || lower.includes("score")) {
    return CANNED_JSON.critic;
  }
  if (lower.includes("consistency")) {
    return CANNED_JSON.consistency;
  }
  return { result: "mock" };
}

/**
 * In-memory provider adapter that produces deterministic mock outputs for tests and local dev.
 */
export class MockAdapter implements ProviderAdapter {
  private callCount = 0;
  private failureCount = 0;
  private imageCounter = 0;

  /**
   * Initializes a new MockAdapter with optional fault injection configuration.
   * @param config Fault injection and test hooks.
   */
  constructor(private readonly config: MockAdapterConfig = {}) {}

  /**
   * Evaluates fault injection rules and throws configured errors if triggered.
   */
  private checkFaultInjection(): void {
    this.callCount += 1;

    if (
      this.config.rateLimitEvery !== undefined &&
      this.config.rateLimitEvery > 0 &&
      this.callCount % this.config.rateLimitEvery === 0
    ) {
      throw new ProviderRateLimitError(
        `Mock rate limit reached on call #${this.callCount}`,
        5000,
      );
    }

    if (
      this.config.failuresBeforeSuccess !== undefined &&
      this.failureCount < this.config.failuresBeforeSuccess
    ) {
      this.failureCount += 1;
      throw new ProviderError(
        `Mock transient error (${this.failureCount}/${this.config.failuresBeforeSuccess})`,
      );
    }
  }

  /**
   * Generates a deterministic small SVG mock image encoded as UTF-8 bytes.
   * @param req The image generation parameters.
   */
  async generateImage(
    req: GenerateImageRequest,
  ): Promise<ImageArtifactResult> {
    this.checkFaultInjection();
    this.imageCounter += 1;
    const label = `mock image ${this.imageCounter}`;
    const width = req.width ?? 512;
    const height = req.height ?? 512;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1a1a2e"/><text x="50%" y="50%" fill="#e94560" font-size="24" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
    const bytes = new TextEncoder().encode(svg);

    return {
      bytes,
      mimeType: "image/svg+xml",
      width,
      height,
      metadata: {
        width,
        height,
        label,
        prompt: req.prompt,
      },
    };
  }

  /**
   * Generates a deterministic small SVG mock edited image encoded as UTF-8 bytes.
   * @param req The image editing parameters.
   */
  async editImage(req: EditImageRequest): Promise<ImageArtifactResult> {
    this.checkFaultInjection();
    this.imageCounter += 1;
    const label = `mock edited image ${this.imageCounter}`;
    const width = 512;
    const height = 512;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0f3460"/><text x="50%" y="50%" fill="#16213e" font-size="24" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
    const bytes = new TextEncoder().encode(svg);

    return {
      bytes,
      mimeType: "image/svg+xml",
      width,
      height,
      metadata: {
        width,
        height,
        label,
        instruction: req.instruction,
        sourceArtifactId: req.sourceArtifactId,
      },
    };
  }

  /**
   * Scores an image against a rubric and returns critique feedback.
   * @param req The score image request.
   */
  async scoreImage(req: ScoreImageRequest): Promise<CritiqueResult> {
    this.checkFaultInjection();
    void req;
    return {
      score: this.config.critiqueScore ?? 0.8,
      feedback: "mock critique",
      issues: this.config.critiqueIssues ?? [],
    };
  }

  /**
   * Returns a deterministic text completion. When req.json is true, selects a
   * canned JSON object based on keywords in the system prompt and returns both
   * the serialized text and the parsed object.
   *
   * @param req The text completion parameters.
   */
  async completeText(req: CompleteTextRequest): Promise<CompleteTextResult> {
    this.checkFaultInjection();

    if (req.json) {
      const parsed = selectCannedJson(req.system, req.prompt);
      const text = JSON.stringify(parsed);
      return { text, parsed, usage: { inputTokens: 10, outputTokens: 20 } };
    }

    const text = `Mock text response for: ${req.prompt.slice(0, 80)}`;
    return { text, usage: { inputTokens: 10, outputTokens: 10 } };
  }
}
