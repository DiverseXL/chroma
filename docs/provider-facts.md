# Provider facts

Verified against live documentation on **2026-10-10** for Banana Hacks 2026.

Rules used while writing this file:

- Every model ID, endpoint, request field, response shape, parameter, limit and
  price below carries a **Source** URL.
- Anything that could not be confirmed from a live document is listed in the
  [UNCONFIRMED register](#unconfirmed-register) and is **not** filled in with a
  guess.
- Where two live sources disagree, both are shown under
  [Conflicting sources](#conflicting-sources).
- Facts taken from a real API response are marked **observed** and quote the
  response verbatim.

## Probe results (2026-10-10)

Both probes were run once. Raw bodies are saved in `docs/probe/`.

### Observed: Google image generation was refused by quota

Request: `POST /v1beta/interactions` with `model = gemini-nano-banana-2.1`.
HTTP **429**. Body of `docs/probe/google-generate.json`, verbatim:

```json
{"error":{"message":"Rate limit exceeded for model gemini-nano-banana-2.1 (limit: 0 requests per day on Free Tier). Please upgrade your tier at https://ai.dev/rate-limit.","code":"too_many_requests"}}
```

This partly settles U1: the Free Tier allowance for that image model is
**0 requests per day**. It also confirms the A4 reading of the pricing page
that image output is not on the free tier.

### Observed: Google vision model is closed to new users

Request: `POST /v1beta/interactions` with `model = gemini-2.5-flash`.
HTTP **404**. Body of `docs/probe/google-vision.json`, verbatim:

```json
{"error":{"message":"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.","code":"not_found"}}
```

This settles U7. The API itself names the replacement: `gemini-3.8-flash`.
The failure is **model availability**, not the endpoint - changing the URL
alone cannot fix it.

### Observed error envelope

Both failures used the same shape, which is what the probe scripts save:

```json
{"error":{"message":"<string>","code":"<string>"}}
```

### Observed: Pollinations legacy keyless endpoint WORKS

One run of `scripts/probe-pollinations.mjs` (no API key sent, no auth header)
returned a real image. `docs/probe/pollinations.png` is a valid **JPEG**, 29,743
bytes, **768x768**, `components 3`, EXIF manufacturer `sana`.

So the current `main` documentation's "Bearer key required" claim does not
hold for the legacy `image.pollinations.ai` host. See U6 (resolved).

Note: the requested `width=1024&height=1024` was not honoured - the image came
back 768x768. That is an observation about this response only; the parameter
contract is discussed in U2.

### Observed: `generateContent` URL/header/body format is correct

A live call to
`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`
with header `x-goog-api-key` and body `{"contents":[{"parts":[{"text":"Say OK"}]}]}`
returned **HTTP 200** with `candidates[0].content.parts[0].text = "OK"`.

That confirms the endpoint shape, the `x-goog-api-key` header, the
`contents[].parts[].text` request body and the
`candidates[].content.parts[].text` response path.

### Observed: the model catalogue (read-only `ListModels`)

`GET /v1beta/models` returned **HTTP 200** with 62 models for this key. Image
and Flash entries included:

| Model name (as returned) | supportedGenerationMethods |
| --- | --- |
| `models/gemini-nano-banana-2.1` | generateContent, countTokens, batchGenerateContent |
| `models/gemini-3.1-flash-image` | generateContent, countTokens, batchGenerateContent |
| `models/gemini-3.1-flash-lite-image` | generateContent, countTokens, batchGenerateContent |
| `models/gemini-3-pro-image` | generateContent, countTokens, batchGenerateContent |
| `models/gemini-2.5-flash` | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `models/gemini-3.8-flash` | generateContent, countTokens, createCachedContent, batchGenerateContent |

Names are returned in `models/{id}` form, which is also the URL path segment.

Caveat worth knowing: `ListModels` still lists `models/gemini-2.5-flash`, yet a
`generateContent` call against it returned 404 "no longer available to new
users". Listing a model does not mean the key is entitled to call it.

### Not yet observed

No successful Google **generation** has happened yet (the image model reports a
0/day free allowance, see U1), so U5 and U9 remain open. The image bytes for
`docs/probe/google-generate.png` have not been produced.

---

## A) Google Gemini API (Google AI Studio)

### A1. Model IDs for Nano Banana image generation

All five IDs below are copied verbatim from the model-selection list on the
image-generation page.

Source: <https://ai.google.dev/gemini-api/docs/image-generation>

| Marketing name | Model ID | Notes (verbatim from source) |
| --- | --- | --- |
| Nano Banana 2.1 (Gemini Nano Banana 2.1) | `gemini-nano-banana-2.1` | "An update to Nano Banana 2, serving as the primary high-efficiency workhorse model for image generation and conversational editing." |
| Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) | `gemini-3.1-flash-lite-image` | "The fastest and cheapest Gemini image model... Not optimized for multiple reference inputs or multi-turn sequential editing." |
| **Nano Banana 2 (Gemini 3.1 Flash Image)** | `gemini-3.1-flash-image` | "The previous-generation high-efficiency workhorse model, balancing speed with 4K generation, world knowledge, and multi-reference image consistency. Recommended for all new projects to use Nano Banana 2.1." |
| Nano Banana Pro (Gemini 3 Pro Image) | `gemini-3-pro-image` | "The premium choice for the most complex visual tasks." |
| Nano Banana (Gemini 2.5 Flash Image) | `gemini-2.5-flash-image` | "The legacy pioneer of the Nano Banana series." |

**Answer to "Model ID for Nano Banana 2 image generation":** `gemini-3.1-flash-image`
is the model the docs label "Nano Banana 2". The docs recommend
`gemini-nano-banana-2.1` (Nano Banana **2.1**) for all new projects, so that is
the default in `.env.example`.

The same IDs appear in the pricing page headings, with matching emoji labels:

- "Gemini Nano Banana 2.1 🍌 / `gemini-nano-banana-2.1`"
- "Gemini 3.1 Flash Image (Nano Banana 2) 🍌 / `gemini-3.1-flash-image`"
- "Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) 🍌 / `gemini-3.1-flash-lite-image`"

Source: <https://ai.google.dev/gemini-api/docs/pricing>

### A2. Is there a separate image-editing / multi-reference model ID?

**No. Editing uses the same model ID as generation.** There is no separate edit
model.

Source: <https://ai.google.dev/gemini-api/docs/image-generation>

- The page's "Image editing (text-and-image-to-image)" section calls
  `model="gemini-nano-banana-2.1"` — the same ID used for text-to-image.
- Editing is expressed by passing image parts inside `input`, e.g.
  `{ "type": "image", "mime_type": "image/png", "data": "<BASE64_IMAGE_DATA>" }`.
- Multi-turn editing chains turns with `previous_interaction_id`.
- Multi-reference: "Up to 14 reference images: Mix up to 14 reference images to
  produce the final image." The per-model breakdown table on the same page
  breaks that into object/character/style reference counts.

### A3. Vision model usable as a critic

| Item | Value | Source |
| --- | --- | --- |
| Model code | `gemini-2.5-flash` | <https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash> |
| Supported inputs | "Text, images, video, audio" | same |
| Supported output | "Text" | same |
| Image generation capability | "Not supported" | same |
| Listed in the Interactions API supported-model table | yes (`Gemini 2.5 Flash` / `gemini-2.5-flash`) | <https://ai.google.dev/gemini-api/docs/interactions-overview> |

Access caveat, verbatim from
<https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash>:

> To ensure reliable performance for everyone, we are limiting access to the 2.5
> models to users who have actively used them in the past. These models are not
> deprecated and will continue to be served until further notice through the
> API. For any new projects, use our latest models: 3.5 Flash-Lite or 3.8 Flash.

So `gemini-2.5-flash` is confirmed as a vision-capable model, but a brand-new
project may be refused.

**Observed (2026-10-10):** a fresh project *is* refused. A live call returned
HTTP 404 with "This model models/gemini-2.5-flash is no longer available to new
users. Please update your code to use models/gemini-3.8-flash for the latest
features and improvements."

The named replacement `gemini-3.8-flash` is confirmed vision-capable on its
own model page - supported inputs are "Text, Image, Video, Audio, and PDF".

Source: <https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash>

`GOOGLE_MODEL_VISION` therefore defaults to `gemini-3.8-flash`.

### A4. Free tier limits

What the live rate-limits page states, verbatim
(<https://ai.google.dev/gemini-api/docs/rate-limits>):

> Rate limits are usually measured across three dimensions: Requests per minute
> (RPM) · Tokens per minute (input) (TPM) · Requests per day (RPD)

> Rate limits are applied per project, not per API key. Requests per day (RPD)
> quotas reset at midnight Pacific time.

> Limits vary depending on the specific model being used, and some limits only
> apply to specific models. For example, Images per minute, or IPM, is only
> calculated for models capable of generating images (Nano Banana), but is
> conceptually similar to TPM.

> Rate limits depend on a variety of factors (such as your usage tier) and can
> be viewed in Google AI Studio.

> Specified rate limits are not guaranteed and actual capacity may vary.

Spend-based rate limits (same page), evaluated on a rolling 10-minute window:

| Usage tier | Spend rate limit (per 10 minutes) |
| --- | --- |
| Free | N/A |
| Tier 1 | $10 |
| Tier 2 | $50 |
| Tier 3 | $200 |

Usage tiers (same page): Free = "Active project or free trial"; Tier 1 = "Set
up and link an active billing account"; Tier 2 = "Paid $100 + 3 days from first
successful payment"; Tier 3 = "Paid $1,000 + 30 days from first successful
payment".

- **Requests per minute (free tier): UNCONFIRMED** — see U1.
- **Requests per day (free tier): UNCONFIRMED** — see U1.
- **Images per minute (IPM, free tier): UNCONFIRMED** — see U1.

#### Is image output included on the free tier?

**No — not according to the live pricing page.** For every Nano Banana model the
"Free Tier" column reads **"Not available"** on both the input-price and
output-price rows.

Source: <https://ai.google.dev/gemini-api/docs/pricing>

| Model | Free Tier column, Input price | Free Tier column, Output price |
| --- | --- | --- |
| `gemini-nano-banana-2.1` | Not available | Not available |
| `gemini-3.1-flash-image` | Not available | Not available |
| `gemini-3.1-flash-lite-image` | Not available | Not available |
| `gemini-3.8-flash` (text model, for contrast) | Free of charge | Free of charge |

The only "Can be tested in Google AI Studio" footnote (`***`) on the
`gemini-3.1-flash-image` block attaches to the *Grounding* row, not to the
input/output price rows.

> **Implication for this project:** the "free providers" premise only holds for
> the *text/vision* model (`gemini-2.5-flash`-class) and for Pollinations. The
> Nano Banana image models are billed-only per the pricing page. This must be
> re-checked with the probe, which will surface a billing/quota error verbatim
> if the project has no paid tier.

### A5. Pricing per image when you exceed the free tier

Source: <https://ai.google.dev/gemini-api/docs/pricing>

#### `gemini-nano-banana-2.1` — Standard

- Input price: `$1.50` per 1M tokens (text/image/video)
- Output price: `$7.50` (text and thinking), `$30.00` (images)
- Verbatim: "Equivalent to $0.0336 per 1K image\*, $0.0504 per 2K image\*, and
  $0.113 per 4K image\*."
- Footnote: "Image output is priced at $30 per 1,000,000 tokens (Standard) and
  $15 per 1,000,000 tokens (Batch). Output images at 1K (1024x1024px) consume
  1120 tokens and are equivalent to $0.0336 per image. Output images at 2K
  (2048x2048px) consume 1680 tokens and are equivalent to $0.0504 per image.
  Output images at 4K (4096x4096px) consume 3780 tokens and are equivalent to
  $0.113 per image."

#### `gemini-nano-banana-2.1` — Batch

- Output price: `$15.00` per 1M tokens (images)
- "Equivalent to $0.0168 per 1K image\*, $0.0252 per 2K image\*, and $0.0567 per
  4K image\*."

#### `gemini-3.1-flash-image` (Nano Banana 2) — Standard

- Input price: `$0.50` per 1M tokens (text/image)
- Output price: `$3` (text and thinking), `$60.00` (images)
- "Equivalent to $0.045 per 0.5K image\* $0.067 per 1K image\*, $0.101 per 2K
  image\*, and $0.151 per 4K image\*."
- Footnote: "Image output is priced at $60 per 1,000,000 tokens. Output images
  at 0.5K (512px) consume 747 tokens and are equivalent to $0.045 per image.
  Output images at 1K (1024x1024px) consume 1120 tokens and are equivalent to
  $0.067 per image. Output images at 2K (2048x2048px) consume 1680 tokens and
  are equivalent to $0.101 per image. Output images at 4K (4096x4096px) consume
  2520 tokens and are equivalent to $0.151 per image."

#### `gemini-3.1-flash-image` (Nano Banana 2) — Batch

- Output price: `$30.00` per 1M tokens (images)
- "Equivalent to $0.022 per 0.5K image\* $0.034 per 1K image\*, $0.050 per 2K
  image\*, and $0.076 per 4K image\*."

#### `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) — Standard

- Input price: `$0.25` per 1M tokens (text/image/video)
- Output price: `$1.50` (text and thinking), `$30.00` (images)
- "Equivalent to $0.0336 per 1K resolution image\*"
- Footnote: "Image output is priced at $30 per 1,000,000 tokens. Output images
  at 1K (1024x1024px) consume 1120 tokens and are equivalent to $0.0336 per
  image."

Batch equivalent: `$15.00` per 1M tokens, "$0.0168 per 1K resolution image".

> `gemini-3-pro-image` (Nano Banana Pro) pricing is **not recorded here**: this
> step is scoped to free providers. That is a deliberate omission, not an
> UNCONFIRMED claim — record it from the same pricing page before adopting that
> model.

### A6. Long-running call mechanism

**Answer: synchronous by default, with an opt-in background mode polled via
`interactions.get()`. This is *not* the classic `operations` polling pattern.**

Sources:

- <https://ai.google.dev/gemini-api/docs/interactions-overview>
- <https://ai.google.dev/gemini-api/docs/get-started>

Verbatim from the Interactions overview:

> The Interactions API is the best way to build with Gemini models and agents.
> As of June 2026, it is Generally Available and recommended for all new
> projects. While it is now considered legacy, the original generateContent API
> remains fully supported.

> New capabilities out of the box: ... and background execution for long-running
> tasks using background=true.

Verbatim from the Get started page:

> Run tasks in the background. Set background=True to run long tasks
> asynchronously. Poll for results with interactions.get().

Storage/retention, verbatim from the Interactions overview:

> By default, the API stores all Interaction objects (store=true) ...
> Paid tier: The system retains interactions for 55 days.
> Free tier: The system retains interactions for 1 day.

> ... store=false is incompatible with background execution and prevents using
> previous_interaction_id for subsequent turns.

All image-generation examples on the image-generation page use the
synchronous `interactions.create` form — none of them poll an operation.

> Note: a separate long-running *operations* polling mechanism does exist in the
> Gemini API, but it belongs to the **Batch API** ("Gets the latest state of a
> long-running operation. Clients can use this method to poll the operation
> result at intervals as recommended by the ..."), which the Interactions
> overview lists as not available in the Interactions API.
> Source: <https://ai.google.dev/api/batch-api> ·
> <https://ai.google.dev/gemini-api/docs/interactions-overview>
> It is not used by anything in this repo.

### A7. Exact SDK and REST endpoint used to call each model

#### REST — both image generation and vision

Source: <https://ai.google.dev/gemini-api/docs/image-generation>

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-nano-banana-2.1",
    "input": [
      {"type": "text", "text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
    ]
  }'
```

The multi-turn / edit variant on the same page adds `previous_interaction_id`
and `response_format`:

```json
{
  "model": "gemini-nano-banana-2.1",
  "input": "Update this infographic to be in Spanish. Do not change any other elements of the image.",
  "previous_interaction_id": "<PREVIOUS_INTERACTION_ID>",
  "response_format": {
    "type": "image",
    "mime_type": "image/jpeg",
    "aspect_ratio": "16:9",
    "image_size": "2K"
  }
}
```

Documented request fields for this endpoint (only these are used by the probe):

| Field | Where documented |
| --- | --- |
| `model` | image-generation page, all REST samples |
| `input` | image-generation page, all REST samples (string, or array of parts) |
| `input[].type` (`"text"` / `"image"`) | image-generation page, image-editing REST sample |
| `input[].text` | image-generation page |
| `input[].mime_type` | image-generation page, image-editing REST sample |
| `input[].data` | image-generation page, image-editing REST sample |
| `previous_interaction_id` | image-generation page, multi-turn sample |
| `response_format` (+ `type`, `mime_type`, `aspect_ratio`, `image_size`) | image-generation page, multi-turn sample |
| `tools` (e.g. `{"type": "google_search"}`) | image-generation page, multi-turn sample |
| `background` | <https://ai.google.dev/gemini-api/docs/get-started> |
| `store` | <https://ai.google.dev/gemini-api/docs/interactions-overview> |
| `system_instruction`, `generation_config` | <https://ai.google.dev/gemini-api/docs/interactions-overview> |

Response fields, verbatim from the image-generation page:

> You can retrieve generated image data by using the interaction.output_image
> property, which returns the last generated image block.

JavaScript sample on that page:

```js
const generatedImage = interaction.output_image;
const buffer = Buffer.from(generatedImage.data, "base64");
```

So the confirmed response path is **`output_image.data`** (base64 string), plus
**`interaction.id`** for chaining turns (used by `previous_interaction_id`).

> The exact JSON *wrapper* around `output_image` in the raw HTTP body is not
> shown on any page I could read. `scripts/probe-google.mjs` therefore walks the
> parsed response for an `output_image` object with a string `data` field rather
> than asserting a wrapper, and it writes the complete raw body to
> `docs/probe/google-generate.json` so the real shape can be recorded after the
> first run. See U5.

#### REST - `models.generateContent` (used by the probe)

Source: <https://ai.google.dev/api/generate-content>

Endpoint, verbatim:

> post `https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent`

where `model` is `models/{model}`.

Documented request-body fields used by the probe:

| Field | Where documented |
| --- | --- |
| `contents[]` | "Required. The content of the current conversation with the model." |
| `generationConfig` | "Optional. Configuration options for model generation and outputs." |
| `contents[].parts[]` | curl samples: `{"parts":[{"text": "..."}]}` |

Part shape from the same page's image curl sample (snake_case, as printed):

```json
{"contents": [{"parts": [{"text": "Tell me about this instrument"},
  {"inline_data": {"mime_type": "image/jpeg", "data": "<BASE64>"}}]}]}
```

`inlineData` / `mimeType` are the camelCase protobuf-JSON equivalents of the
`inline_data` / `mime_type` printed above; the script flags them UNVERIFIED.

Documented response fields used by the probe: `candidates[]` →
`content.parts[]`, each part carrying `text` or inline image data. The page's
own sample reads them with `jq ".candidates[].content.parts[].text"`.

`generationConfig.responseModalities` is **UNVERIFIED** - see U9.

#### JavaScript SDK

Source: <https://ai.google.dev/gemini-api/docs/image-generation> ·
<https://ai.google.dev/gemini-api/docs/interactions-overview>

- Package: `@google/genai`
- Minimum version, verbatim: "On JavaScript, this is @google/genai package from
  2.3.0 version onwards."
- Python equivalent: `google-genai` from 2.3.0; Go: `google.golang.org/genai`;
  Java: `com.google.genai:google-genai`.
- Entry point: `import { GoogleGenAI } from "@google/genai";`
- Call: `const interaction = await ai.interactions.create({ model, input })`
- Image read: `interaction.output_image` → `.data` (base64)
- Multi-turn: pass `previous_interaction_id: interaction.id`

```js
const ai = new GoogleGenAI({});
const interaction = await ai.interactions.create({
  model: "gemini-nano-banana-2.1",
  input: "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme",
});
const generatedImage = interaction.output_image;
const buffer = Buffer.from(generatedImage.data, "base64");
```

> The probe deliberately uses the **REST** endpoint instead of the SDK so that
> it has zero runtime dependencies and can dump the raw body byte-for-byte.

---

## B) Pollinations.ai

> **Read this first.** Pollinations has two documented surfaces, and they
> disagree. See [Conflicting sources](#conflicting-sources).

### B1. Base URL for text-to-image

**Confirmed: `https://gen.pollinations.ai`, endpoint `GET /image/{prompt}`.**

Sources:

- <https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md>
  — "**Version:** `0.3.0` · **OpenAPI:** `3.1.0` · **Base URL:**
  `https://gen.pollinations.ai`"
- <https://gen.pollinations.ai/openapi.json> — `info.description` contains
  "**Base URL:** `https://gen.pollinations.ai`"
- <https://github.com/pollinations/pollinations/blob/main/README.md> —
  `curl -H "Authorization: Bearer YOUR_API_KEY"
  'https://gen.pollinations.ai/image/a%20beautiful%20sunset' -o image.jpg`

Endpoint heading, verbatim from `main/APIDOCS.md`:

> `#### GET /image/{prompt} — Generate Image`
>
> Generate an image from a text prompt. Returns JPEG, PNG, or SVG depending on
> the selected model.

Full example URL printed by the same page:

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

Working example from the same section:

```bash
curl "https://gen.pollinations.ai/image/a%20beautiful%20sunset%20over%20mountains?model=tongyi-mai%2Fz-image-turbo&width=1024" \
  -H "Authorization: Bearer $POLLINATIONS_KEY"
```

Response, verbatim: "`200` · `image/jpeg`, `image/png`, `image/svg+xml` —
Success - Returns the generated image".

There is also an OpenAI-compatible POST variant on the same base URL:
`POST /v1/images/generations` ("OpenAI-compatible image generation
endpoint"). Source: same `main/APIDOCS.md`.

The older `GET https://image.pollinations.ai/prompt/{prompt}` form exists only
on the **stale `master` branch** — see Conflicting sources.

### B2. Is an API key required?

**Yes, on the current documented API.**

Source: <https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md>

Verbatim:

> **1. Get an API key** at [enter.pollinations.ai](https://enter.pollinations.ai/keys).

Auth table, verbatim:

| Endpoint | Auth |
| --- | --- |
| `GET /{id}`, `GET /{id}/metadata`, `HEAD /{id}` | None — media URLs are public reads |
| `GET /models`, `GET /v1/models`, `GET /image/models`, `GET /text/models`, `GET /audio/models`, `GET /embeddings/models` | None — model catalogue is public. Sending a bearer key returns the same data; some endpoints add per-account fields when authenticated. |
| Everything else | Bearer key required unless the endpoint documents `?key=` support |

Transports, verbatim:

> ```http
> Authorization: Bearer <key>
> ```
>
> ```http
> GET /image/cat?key=<key>
> ```
>
> The header is preferred for everything except browser flows that can't set
> custom headers (image/audio `GET` endpoints and WebSocket realtime sessions).

Error table, verbatim: "`401` | `UNAUTHORIZED` | Missing or invalid API key.
Provide via `Authorization: Bearer <key>` header or `?key=<key>` query param."

Key types (same page): Secret key prefix `sk_` ("Server-only ... Never ship to a
browser, mobile app, or repo"), App key prefix `pk_`, and a legacy "Raw
publishable key" `pk_` with no app/OAuth binding.

- **Key required for `GET /image/{prompt}`?** Yes (falls under "Everything
  else"), transport either `Authorization: Bearer` or `?key=`.
- **Key required for `GET /image/models` and `GET /models`?** No.
- **Probe-dependent:** what an actually-issued keyless request returns. The
  probe reports the real status code and body; see U6.

### B3. Supported parameters

Full parameter table for `GET /image/{prompt}`, verbatim from
<https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md>:

| Param | In | Type | Description (verbatim) |
| --- | --- | --- | --- |
| `prompt` \* | path | string | Text description of the image to generate |
| `model` | query | string | Model to use. See /image/models for the current canonical IDs and aliases. · default: `"tongyi-mai/z-image-turbo"` |
| `width` | query | integer | Width in pixels. For images, exact pixels; ... · default: `1024` |
| `height` | query | integer | Height in pixels. For images, exact pixels; ... · default: `1024` |
| `seed` | query | integer | Seed for reproducible results. Use -1 for random. Supported by: black-forest-labs/flux.1-schnell, black-forest-labs/flux.1.1-pro, tongyi-mai/z-image-turbo, bytedance/seedream-4.0, black-forest-labs/flux.2-klein-4b, bytedance/seedance-2.0. Other models ignore this parameter. · default: `0` · range: `-1…2147483647` |
| `safe` | query | any | Safety features: comma-separated list of privacy, secrets, sexual, violence, shield, true, nsfw. ... Also accepted in the Pollinations-Safe header. Defaults to off; false and 0 are accepted as off. |
| `quality` | query | `"low"` \| `"medium"` \| `"high"` \| `"hd"` | Image quality level. Supported by `gptimage`, `gptimage-large`, `gpt-image-2`, and `grok-imagine-image-2.0`. · default: `"medium"` |
| `image` | query | string | Reference image URL(s) for image editing or video generation. Separate multiple URLs with `\|` or `,`. **Image models:** Used for editing or style reference. ... |
| `reference_images` | query | string | Video models only: ... |
| `reference_videos` | query | string | Video models only: ... |
| `reference_audios` | query | string | Video models only: ... |
| `transparent` | query | boolean | Generate image with transparent background. Only supported by `gptimage` and `gptimage-large`. · default: `false` |
| `resolution` | query | enum (8) — `"1k"`, `"2k"`, `"360p"`, … | Output resolution for image and video models that advertise `resolutions` in `/models`. ... |

\* = required parameter.

Answering the four parameters asked about:

| Asked about | Confirmed? | Value |
| --- | --- | --- |
| `width` | Yes | query, integer, default `1024` |
| `height` | Yes | query, integer, default `1024` |
| `model` | Yes | query, string, default `tongyi-mai/z-image-turbo` |
| `seed` | Yes | query, integer, default `0`, range `-1…2147483647`, `-1` = random; ignored by models outside the supported list |
| `nologo` | **No** | **UNCONFIRMED — U2** |

The word `nologo` occurs **zero times** in the current `main/APIDOCS.md`, so it
is not recorded as a supported parameter here.

### B4. Documented rate limits

Source: <https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md>

What is actually documented:

| Fact | Verbatim |
| --- | --- |
| Legacy raw publishable key | "Rate-limited to 1 pollen per IP per hour." |
| Error code | "`429` \| `RATE_LIMITED` \| Too many requests. Slow down." |
| Backoff advice | "Watch `429` and `503`. A `Retry-After` header tells you how long to back off. `502` from us means upstream provider — usually transient." |
| Per-user RPM field (community model registration) | "`perUserRpm` \| `number` \| null \| Maximum requests per minute for each Pollinations user. Decimals are supported; 0.5 means one request every two minutes. Null means no Pollinations-side limit." |

- **Numeric RPM/RPD for a normal key: UNCONFIRMED — see U3.**

### B5. Does an image-edit or reference-image endpoint exist?

**Yes — two ways, both confirmed.**

Source: <https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md>

#### 1. `POST /v1/images/edits` (OpenAI Images Edits compatible)

> Edit images using a text prompt and one or more source images.
> Accepts JSON with image URLs or multipart/form-data with file uploads.
> Set response_format to "url" for a stored media URL, or "b64_json" for
> base64 image data (default).

| Field | Type | Notes |
| --- | --- | --- |
| `prompt` \* | string | length `1…32000` |
| `image` \* | string \| object\[\] | "Source image(s). A URL string, or an array of {image_url} objects (OpenAI format)" |
| `model` | string | default `"black-forest-labs/flux.1-schnell"` |
| `n` | integer | "Number of images to generate (currently max 1)" · range `1…1` |
| `size` | string | "Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512)" |
| `quality` | enum | `"standard"` \| `"hd"` \| `"low"` \| `"medium"` \| `"high"` · default `"medium"` |
| `response_format` | enum | `"url"` \| `"b64_json"` · default `"b64_json"` |
| `resolution` | enum (8) | Pollinations extension |
| `safe` | any | as above |

Example, verbatim:

```bash
curl -X POST "https://gen.pollinations.ai/v1/images/edits" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -F "image=@./input.png" \
  -F "prompt=make the sky a vivid sunset" \
  -F "model=black-forest-labs/flux.1-kontext-pro"
```

The multipart note on the same page also states that repeating `-F "image=@…"`
passes multiple reference images "on models that accept them
(`bytedance/seedream-4.0`, `google/gemini-2.5-flash-image`,
`black-forest-labs/flux.2-klein-4b`)".

#### 2. `image` query parameter on `GET /image/{prompt}`

> Reference image URL(s) for image editing or video generation. Separate
> multiple URLs with `|` or `,`. **Image models:** Used for editing or style
> reference.

Per-model support is discoverable at `GET /image/models`
(`video_capabilities` and `max_reference_images`).

### B6. Is Pollinations actually free?

**UNCONFIRMED — see U4.** The current docs describe a paid credit system, not a
free tier:

Source for all four bullets:
<https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md>
unless another URL is given.

- "Pollen credits — simple pay-as-you-go system ($1 ≈ 1 Pollen)" —
  <https://github.com/pollinations/pollinations/blob/main/README.md>
- Error table: "`402` | `PAYMENT_REQUIRED` | Insufficient pollen balance or
  API key budget exhausted."
- Auth section: "`402 PAYMENT_REQUIRED` means the key authenticated but the
  account or per-key budget is exhausted."
- Model list endpoints advertise `pricing` metadata and a `paid_only` flag.

No page I read states that image generation is free of charge.

---

## KIE AI

Verified against live documentation on **2026-10-11**. Every fact carries a
source URL. Anything not confirmed from a live document is listed under
[KIE UNCONFIRMED](#kie-unconfirmed) and is not guessed.

### K1. Base URL and authentication

| Fact | Value | Source |
| --- | --- | --- |
| API base URL | `https://api.kie.ai` | <https://docs.kie.ai/common-api/quickstart.md> ("API Base URL"); <https://docs.kie.ai/market/quickstart.md>; OpenAPI `servers: - url: https://api.kie.ai` on every model page, e.g. <https://docs.kie.ai/market/google/nanobanana2.md> |
| Auth header | `Authorization: Bearer <YOUR_API_KEY>` | <https://docs.kie.ai/getting-started.md> §4 "Required Request Headers"; <https://docs.kie.ai/market/quickstart.md> "Authentication" |
| Content header | `Content-Type: application/json` for JSON bodies (`multipart/form-data` for file-stream upload) | <https://docs.kie.ai/getting-started.md> §4 |
| Auth failure body | `{"code":401,"msg":"You do not have access permissions"}` when headers are missing or wrong | <https://docs.kie.ai/getting-started.md> §4 |
| **Critical** | Errors on `/api/v1/*` (and upload endpoints) are returned with **HTTP 200** plus an error `code` in the body. Always check `code`, not just the HTTP status. | <https://docs.kie.ai/getting-started.md> §4; the same rule is restated in the `code` description of every model OpenAPI, e.g. <https://docs.kie.ai/market/common/get-task-detail.md> |

Authentication is Bearer-only: no `x-api-key` (or any other key header) appears
anywhere in the docs read for this pass.

### K2. Endpoints

Image generation is **asynchronous** - there is no synchronous image endpoint.

| Purpose | Endpoint | Source |
| --- | --- | --- |
| Create generation task | `POST https://api.kie.ai/api/v1/jobs/createTask` | <https://docs.kie.ai/market/quickstart.md> "Unified API Structure"; per-model pages, e.g. <https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md> |
| Query task status/result | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}` | <https://docs.kie.ai/market/quickstart.md>; <https://docs.kie.ai/market/common/get-task-detail.md> |
| Account credit balance | `GET https://api.kie.ai/api/v1/chat/credit` -> `{"code":200,"msg":"success","data":100.5}` | <https://docs.kie.ai/common-api/get-account-credits.md> |
| Turn a generated-file URL into a download link | `POST https://api.kie.ai/api/v1/common/download-url`, body `{"url":"..."}`; links valid **20 minutes** | <https://docs.kie.ai/common-api/quickstart.md> |
| Optional completion webhook | pass `callBackUrl` in the createTask body; KIE POSTs the result (success `code` 200, failure `code` 501) | <https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md>; signature guide <https://docs.kie.ai/common-api/webhook-verification.md> (not read in this pass - K9) |

Verbatim, <https://docs.kie.ai/getting-started.md> §7:

> Image, video and music generation tasks are asynchronous: create a task, then
> query Get Task Details or receive a callback.

> A successful request returns `{"code": 200, "data": {"taskId": "…"}}`.

> A `200 OK` response **only** means the task was successfully **created**. It
> does **not** mean the task is completed.

### K3. Available image models

**Confirmed `model` IDs** (from an OpenAPI `enum` or explicit doc text):

| Marketing name | API model ID | Source |
| --- | --- | --- |
| GPT Image 2 - Text to Image | `gpt-image-2-text-to-image` | <https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md> (request enum) |
| GPT Image 2 - Image to Image | `gpt-image-2-image-to-image` | <https://kie.ai/gpt-image-2> README: "gpt-image-2-text-to-image and gpt-image-2-image-to-image run on POST /api/v1/jobs/createTask" |
| Google Nano Banana 2 | `nano-banana-2` | <https://docs.kie.ai/market/google/nanobanana2.md> (request enum) |
| Google Nano Banana 2.1 | `nano-banana-2-1` | <https://docs.kie.ai/market/google/nanobanana-2-1.md> (request enum) |
| Grok Imagine - Text to Image | `grok-imagine/text-to-image` | <https://docs.kie.ai/market/common/get-task-detail.md> (documented `model` example) |

**Documented image model pages** whose exact `model` IDs were not read (each has
a live page, source for the list: <https://docs.kie.ai/llms.txt>): Nano Banana
Pro, Nano Banana, Nano Banana Edit, Nano Banana 2 Lite, GPT Image 2.5 Flare /
Sunburst (text-to-image and image-to-image), GPT Image-1.5, Seedream 3.0 / 4.0
/ 4.5 / 5.0 Lite / Pro / Flash (text-to-image plus edit/image-to-image/layer
decomposition), Flux-2 pro + flex (text-to-image and image-to-image), Qwen /
Qwen2 / Qwen2.1 / Qwen3 / Qwen3 Pro (text-to-image, image-to-image, edit),
Ideogram character / character-edit / character-remix / v3 (text-to-image, edit,
remix), Grok Imagine + Grok Imagine Image 2.0 (text-to-image, image-to-image,
segment map/edit), Google imagen4 / imagen4-fast / imagen4-ultra, Z-image,
Recraft remove-background + crisp upscale, Topaz image-upscale, Wan 2.7 image +
image-pro, 4o Image, Flux Kontext. Some `llms.txt` descriptions embed candidate
IDs (e.g. `flux-2/pro-text-to-image`, `google/nano-banana`, `qwen/image-edit`)
but these were not verified against a model-page enum - see K1.

KIE's homepage also advertises these image models with USD pricing: Nano
Banana Pro, Nano Banana 2, GPT Image 2, GPT Image 2.5, Seedream 5 Pro,
Seedream 4.5, Nano Banana (<https://kie.ai>).

### K4. Text-to-image request shape (`createTask`)

Required envelope: body must contain `model` (required) and `input` (required);
`callBackUrl` (optional, URI). Source for the envelope and field requirements:
<https://docs.kie.ai/market/google/nanobanana2.md>,
<https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md>,
<https://docs.kie.ai/market/google/nanobanana-2-1.md>.

Documented example, verbatim from <https://docs.kie.ai/market/google/nanobanana2.md>:

```json
{
  "model": "nano-banana-2",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "prompt": "Comic poster: cool banana hero in shades leaps from sci-fi pad. ...",
    "image_input": [],
    "aspect_ratio": "auto",
    "resolution": "1K",
    "output_format": "png"
  }
}
```

#### `gpt-image-2-text-to-image` - `input` fields

Source: <https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md>

| Field | Required | Type / enum | Notes (verbatim where quoted) |
| --- | --- | --- | --- |
| `prompt` | **yes** | string, 1-20000 chars | "Text prompt. Required, maximum 20,000 characters." |
| `aspect_ratio` | no | `auto`, `1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `5:4`, `4:5`, `16:9`, `9:16`, `2:1`, `1:2`, `3:1`, `1:3`, `21:9`, `9:21` | "auto by default"; 2K unsupported: 5:4, 4:5, 3:1, 1:3, 9:21; 4K unsupported: 3:1, 1:3, 9:21 |
| `resolution` | no | `1K`, `2K`, `4K` | "Set this field explicitly." `background` only available at 1K |
| `background` | no | `transparent`, `opaque`, `auto` | "only supported when the resolution is 1K" |

#### `nano-banana-2` / `nano-banana-2-1` - `input` fields

Source: <https://docs.kie.ai/market/google/nanobanana2.md>,
<https://docs.kie.ai/market/google/nanobanana-2-1.md>

| Field | Required | Type / enum | Notes |
| --- | --- | --- | --- |
| `prompt` | **yes** | string, max 20000 chars | |
| `image_input` | no | array of URL strings | "File URL after upload, not file content"; `image/jpeg`, `image/png`, `image/webp`; max 30.0MB each. `nano-banana-2`: `maxItems: 14`. `nano-banana-2-1`: `maxItems: 10` |
| `aspect_ratio` | no | `1:1`, `2:3`, `3:2`, `1:4`, `4:1`, `3:4`, `4:3`, `4:5`, `5:4`, `1:8`, `8:1`, `9:16`, `16:9`, `21:9`, `auto` | default `auto` |
| `resolution` | no | `1K`, `2K`, `4K` | default `1K` |
| `output_format` | no | `png`, `jpg` | default `jpg` |

**Conflicting sources (within KIE):** the `nano-banana-2` docs schema says
`maxItems: 14` / "supports up to 14 images" (<https://docs.kie.ai/market/google/nanobanana2.md>)
while the live playground form on <https://kie.ai/nano-banana-2> says
"Maximum files: 10" and "supports up to 10 images". See K2 in the KIE
UNCONFIRMED table.

### K5. Response shape - where the image lives

**Create step** (HTTP 200, verbatim example from
<https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md>):

```json
{"code": 200, "msg": "success", "data": {"taskId": "task_gptimage_1765180586443"}}
```

**Poll step** - `GET /api/v1/jobs/recordInfo?taskId=...` returns `data` with
these fields (source: <https://docs.kie.ai/market/common/get-task-detail.md>):

| Field | Meaning |
| --- | --- |
| `taskId`, `model` | task id and the model used |
| `state` | enum `waiting`, `queuing`, `generating`, `success`, `fail` |
| `param` | JSON string of the original request; "Its `input` is itself a JSON string - parse it twice." |
| `resultJson` | **JSON string** with the result; present when `state` is `success`, else may be null/empty |
| `response` | "Parsed form of resultJson. Present only when state is success." |
| `failCode`, `failMsg` | numeric-string failure code and reason; present when `state` is `fail` |
| `costTime` | processing time in seconds |
| `createTime`, `completeTime` | Unix ms timestamps |
| `creditsConsumed` | number - actual credits deducted ("0 for failed tasks") |

**Image location:** for images, `resultJson` parses to
`{"resultUrls": ["https://..."]}` - verbatim from
<https://docs.kie.ai/market/common/get-task-detail.md>:

> For images/media/videos: {resultUrls: []}

and from the model callback examples, e.g.
<https://docs.kie.ai/market/google/nanobanana-2-1.md>:

```json
{"resultUrls":["https://tempfile.aiquickdraw.com/workers/images/image_90b6bf4499a80b74a2b5ee640b7aaf70.jpg"]}
```

So the image URL is at **`data.resultJson` (string) -> parse -> `resultUrls[0]`**.
No base64 image bytes are returned by the image API. Generated media files are
kept for **14 days** (<https://docs.kie.ai/getting-started.md> §6). Whether
`resultUrls` can be fetched directly or must first pass through
`/api/v1/common/download-url` is not stated - see K3.

Polling errors also arrive as `{code, msg, data}`; `422` means "taskId is
missing, or the task does not exist or does not belong to your account"
(<https://docs.kie.ai/market/common/get-task-detail.md>).

### K6. Image editing / reference-image inputs - supported

1. **Reference/edit inputs on the generation model itself:** `input.image_input`
   (URL array) on `nano-banana-2` (up to 14 per docs) and `nano-banana-2-1`
   (up to 10). Sources: <https://docs.kie.ai/market/google/nanobanana2.md>,
   <https://docs.kie.ai/market/google/nanobanana-2-1.md>.
2. **Dedicated edit model IDs** documented as separate pages: GPT Image 2
   image-to-image ("image-to-image accepts up to 16 input images",
   <https://kie.ai/gpt-image-2>), plus Google - Nano Banana Edit
   (<https://docs.kie.ai/market/google/nano-banana-edit.md>), Seedream 4.0/4.5/
   5.0 Lite/Pro/Flash edit pages, Qwen image-edit, Ideogram V3 edit, Flux-2
   image-to-image, Grok Imagine image-to-image (page URLs from
   <https://docs.kie.ai/llms.txt>; their request schemas were not read - K1).
3. **Files that are not hosted yet** must be uploaded first via the File Upload
   API (base64, file stream, or remote URL): "Files that are not hosted yet can
   be uploaded first with the Kie.ai File Upload API"
   (<https://kie.ai/nano-banana-2>); endpoints listed at
   <https://docs.kie.ai/file-upload-api/quickstart.md>.

### K7. Credits - what one image costs

**Ratio: 1 credit = $0.005 USD ($1 = 200 credits).** Two independent confirmations:

- <https://kie.ai/gpt-image-2> price card, verbatim: "now just **6 credits
  ($0.03)** for 1 K, **10 credits ($0.05)** for 2 K, and **16 credits ($0.08)**
  for 4 K."
- <https://kie.ai/nano-banana-2> price card, verbatim: "**8 credits ($0.04)**
  for 1 K, **12 credits ($0.06)** for 2 K, and **18 credits ($0.09)** for 4 K".
- Cross-check on <https://kie.ai/pricing>, whose table prints a "Credits / Gen"
  column next to "Our Price (USD)": claude-haiku-5-5 input `12` credits per
  million tokens = `$0.06`; kling 3.0 omni `67` credits per second = `$0.335`
  (both 1 credit = $0.005).

| Model | 1K | 2K | 4K | Source |
| --- | --- | --- | --- | --- |
| `gpt-image-2-text-to-image` | 6 credits ($0.03) | 10 ($0.05) | 16 ($0.08) | <https://kie.ai/gpt-image-2> |
| `nano-banana-2` | 8 credits ($0.04) | 12 ($0.06) | 18 ($0.09) | <https://kie.ai/nano-banana-2> |

Other confirmed billing facts:

- New users get **80 free credits** (<https://kie.ai> FAQ "Where can I test
  models before development?"; also <https://kie.ai/gpt-image-2> and
  <https://kie.ai/nano-banana-2>: "New Kie.ai users receive 80 free credits for
  testing.").
- **Failed tasks are not charged**: "Failed tasks are not charged."
  (<https://kie.ai> FAQ "Will I be charged if a task fails?"); callback schema:
  "Credits consumed by the task; **0 for failed tasks**"
  (<https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md>).
- The actual charge per task is reported as `data.creditsConsumed` (number)
  (<https://docs.kie.ai/market/common/get-task-detail.md>).
- Chat/vision requests also bill credits: the Gemini chat response carries
  `credits_consumed` with example `0.01`
  (<https://docs.kie.ai/market/gemini/gemini-3-8-flash.md>).
- Credits do not expire (<https://kie.ai> FAQ "Do KIE credits expire?").
- Balance endpoint: `GET /api/v1/chat/credit` -> `{"code":200,"msg":"success",
  "data":100.5}` (<https://docs.kie.ai/common-api/get-account-credits.md>).
- **Stale example warning:** the `nano-banana-2` doc's callback example shows
  `creditsConsumed: 8` for a **2K** request
  (<https://docs.kie.ai/market/google/nanobanana2.md>), but the current price
  card says 2K = 12 credits. The price card is treated as current; doc examples
  are illustrative.
- USD prices for other image models (credits derived as USD / 0.005, not printed
  by KIE): GPT Image 2.5 1K $0.03 / 2K $0.05; Nano Banana Pro 1K/2K $0.09,
  4K $0.12; Seedream 5.0 Pro $0.035 per image (<https://kie.ai>). See K8.

### K8. Rate limits and retry semantics

| Fact | Value | Source |
| --- | --- | --- |
| New-request rate limit | **20 new generation requests per 10 seconds** (FAQ: "equals up to 120 new requests per minute"), applied **per account** | <https://docs.kie.ai/getting-started.md> §8; <https://kie.ai> FAQ "What are the rate limits?" |
| Concurrency | "This typically allows 100+ concurrent running tasks"; no strict limit on running tasks | <https://docs.kie.ai/getting-started.md> §8; <https://kie.ai> FAQ |
| On exceeding | request returns **`code` 429**; "Rejected requests will not enter the queue" (i.e. the task never started - safe to retry later) | <https://docs.kie.ai/getting-started.md> §8 |
| Raising the limit | contact support; "approvals are handled cautiously" | <https://docs.kie.ai/getting-started.md> §8; <https://kie.ai> FAQ |
| Polling guidance | "Implement exponential backoff: Start with 2-3 second intervals, increase gradually"; "Keep polling until state is success or fail" | <https://docs.kie.ai/market/common/get-task-detail.md> (Best Practices) |
| Callbacks | "Use callbacks for production" to avoid polling | <https://docs.kie.ai/market/common/get-task-detail.md> |
| Retry safety | failed generations cost 0 credits, so re-submitting a failed task does not double-charge | <https://kie.ai> FAQ; callback schema (K7) |
| Retention | generated media **14 days**, logs 2 months; "download and back up ... in advance" | <https://docs.kie.ai/getting-started.md> §6; <https://kie.ai> FAQ |
| Download links | valid **20 minutes** only | <https://docs.kie.ai/common-api/quickstart.md> |

Body `code` values, from <https://docs.kie.ai/market/common/get-task-detail.md>:

- Enum: `200`, `401`, `402`, `404`, `422`, `429`, `433`, `455`, `500`, `501`, `505`
- Described meanings: `200` success; `401` invalid/missing API key; `402`
  insufficient credits; `404` not found; `408` "Timeout - No result has been
  returned for over 10 minutes"; `422` validation error; `429` rate limited;
  `455` maintenance; `500` server error; `501` "Generation Failed"; `505`
  feature disabled.
- `433` appears in the enum with **no description** (K5); `408` is described but
  is not in the enum. Both recorded as-is.

**HTTP-status caveat:** <https://docs.kie.ai/getting-started.md> §4 says errors
on `/api/v1/*` come back as **HTTP 200** with an error `code` in the body, while
the OpenAPI pages document `401`/`422`/`429`/`500` as HTTP responses. Which
behaviour a caller actually sees per failure mode is unobserved - see K4.

### K9. Vision / critic model - yes (via the chat API)

| Item | Value | Source |
| --- | --- | --- |
| Model | `gemini-3-8-flash` | <https://docs.kie.ai/market/gemini/gemini-3-8-flash.md> |
| Endpoint | `POST https://api.kie.ai/gemini/v1/models/gemini-3-8-flash:streamGenerateContent` (path from the page; host from its OpenAPI `servers: https://api.kie.ai`) | same |
| Auth | same `Authorization: Bearer` header | same |
| **Image input** | `contents[].parts[]` accepts `inline_data` with `mime_type` + base64 `data`, and `file_data` with `file_uri`/`mime_type` | same |
| Text output | `candidates[].content.parts[].text` (also `functionCall`, `thoughtSignature`) | same |
| Request extras | `tools` (`googleSearch`, `functionDeclarations`), `generationConfig.thinkingConfig` | same |
| Streaming | body field `stream`, **default `true`**; "The last data chunk carries usageMetadata and credits_consumed, followed by data: [DONE]" | same |
| Credits | response includes `credits_consumed` (example `0.01`) | same |
| Error handling | "Errors are returned with HTTP 200 and a JSON body {"code": <int>, "msg": "<reason>"}" | same |
| Caveat | page warns: "**Chat only** - This model currently supports chat requests only and has not yet been adapted for agent use." | same |

Other chat models (Claude / GPT / Grok families) are documented under
<https://docs.kie.ai/llms.txt>, but their image-input support was not read - see
K6.

### KIE UNCONFIRMED

| ID | Fact | What is missing / how to settle it |
| --- | --- | --- |
| K1 | API `model` IDs for every image model except `gpt-image-2-text-to-image`, `gpt-image-2-image-to-image`, `nano-banana-2`, `nano-banana-2-1`, `grok-imagine/text-to-image` | The model pages exist (K3) but their request `model` enums were not read. Fetch each page's OpenAPI enum. |
| K2 | Max reference images for `nano-banana-2`: **14** (docs schema `maxItems: 14`) vs **10** (live playground "Maximum files: 10") | Two KIE sources disagree. Settle by sending 11+ reference images or asking support. |
| K3 | Whether `resultUrls` are directly fetchable or must go through `POST /api/v1/common/download-url` first | Not stated anywhere read. The probe tries a direct GET first and reports the outcome. |
| K4 | Whether `createTask`/`recordInfo` failures really arrive as HTTP 200 + body `code`, or as real HTTP status codes | getting-started §4 and the OpenAPI response codes contradict each other. Observe with the probe (bad key, bad taskId). |
| K5 | Meaning of body code `433` | Present in every model page's enum, never described. |
| K6 | Image-input support for non-Gemini chat models (Claude/GPT/Grok) as critics | Only the Gemini 3.8 Flash chat page was read. |
| K7 | Behaviour of `stream: false` on the Gemini chat endpoint | The page documents `stream` (default true) and shows a non-stream response schema, but gives no `stream: false` example. |
| K8 | Credit cost for image models other than `gpt-image-2` / `nano-banana-2` | Only those two price cards were read; the credits column on <https://kie.ai/pricing> was not fetched per image model. |
| K9 | Webhook (callback) signature/verification details | Guide exists at <https://docs.kie.ai/common-api/webhook-verification.md> but was not read in this pass. |
| K10 | Probe outcome: real `taskId` flow, real `resultJson`, real credit charge | `scripts/probe-kie.mjs` has not been run yet. |

---

## Conflicting sources

### C1. Pollinations: which API surface is current?

| | Current | Stale |
| --- | --- | --- |
| Source | `main` branch `APIDOCS.md`, `README.md`, `https://gen.pollinations.ai/openapi.json` | `master` branch `APIDOCS.md` |
| URL | <https://raw.githubusercontent.com/pollinations/pollinations/main/APIDOCS.md> | <https://raw.githubusercontent.com/pollinations/pollinations/master/APIDOCS.md> |
| Base URL | `https://gen.pollinations.ai` | `https://image.pollinations.ai/prompt/{prompt}` |
| API key | Required for image generation | "no signup required to get started"; "You can use Pollinations.AI without signing up" |
| Rate limits | `429 RATE_LIMITED` + `Retry-After`; `1 pollen per IP per hour` for legacy raw `pk_` | "Anonymous \| One request every 15s \| No signup"; "Seed \| One request every 5s"; "Flower \| One request every 3s"; "Nectar \| No limits" |
| `nologo` | not present (0 occurrences) | `nologo \| boolean \| Remove the Pollinations watermark (needs account) \| false \| true` |
| Image edit | `POST /v1/images/edits` | `kontext` model + `image` query param |

**Resolution used in this repo:** `main` + `openapi.json` are treated as
authoritative (default branch, versioned `0.3.0`, matches the served OpenAPI
document). The `master` content is recorded only so nobody re-introduces it by
mistake. The live answer is settled by `scripts/probe-pollinations.mjs`, which
is written to send **no key** unless `POLLINATIONS_API_KEY` is set and to report
whatever the API actually returns.

### C2. Google: "free tier" language differs between pricing and rate-limits pages

The rate-limits page describes a Free usage tier ("Active project or free
trial") and generic RPM/TPM/RPD/IPM dimensions, while the pricing page marks the
Nano Banana models' Free Tier column "Not available". Both are recorded above
(A4, A5) without reconciling them, because the numeric per-model limits are not
published on either page.

---

## UNCONFIRMED register

| ID | Fact | Status | What is missing / how to settle it |
| --- | --- | --- | --- |
| U1 | Gemini free-tier **RPM**, **RPD**, and **IPM** for the image models | **Partly resolved by observation** | Observed RPD for `gemini-nano-banana-2.1` = **0** ("limit: 0 requests per day on Free Tier", `docs/probe/google-generate.json`). RPM/IPM, and the allowance for `gemini-3.1-flash-image`, are still unknown. Need: the signed-in AI Studio rate-limit page, or a run of the corrected probe. |
| U2 | Pollinations **`nologo`** parameter | UNCONFIRMED | The string does not occur in `main/APIDOCS.md` or `openapi.json`. Need: either a mention in the current docs, or an observed effect in a real probe response. Do not pass it until then. |
| U3 | Pollinations numeric **rate limits** (requests/minute or /day) for a normal `sk_` key | UNCONFIRMED | Docs only give `429 RATE_LIMITED`, `Retry-After`, and the legacy `1 pollen per IP per hour`. Need: a documented limits page, the key settings at <https://enter.pollinations.ai/keys>, or measured `429` behaviour. |
| U4 | Whether Pollinations image generation can be used at **zero cost** | **Partly resolved by observation** | A keyless call to the legacy host succeeded and returned a real image, so at least that path costs nothing. Whether the current `gen.pollinations.ai` API has any free allowance is still unknown. |
| U5 | Exact **success response shape** for a Gemini image call | UNCONFIRMED | The first probe never succeeded, so only the error envelope was observed. Need: a successful `candidates[].content.parts[].inlineData.data` payload. |
| U6 | Whether the legacy keyless Pollinations endpoint still works | **Resolved by observation** | Yes. One run with no API key produced a valid 768x768 JPEG (29,743 bytes) at `docs/probe/pollinations.png`. The current `main` docs' "key required" claim does not hold for this legacy host. |
| U7 | Which vision model to use for the critic role | **Resolved by observation** | `gemini-2.5-flash` returns 404 for new users and the API directs callers to `gemini-3.8-flash`, whose model page lists image input. `GOOGLE_MODEL_VISION=gemini-3.8-flash`. |
| U8 | Whether a **paid** provider is required for image output (fal.ai etc.) | Out of scope | Explicitly excluded by the task: "fal.ai is out of scope for this step". |
| U9 | Field name/casing for requesting image output from `generateContent` | UNVERIFIED | `generationConfig.responseModalities` with `["TEXT","IMAGE"]` is sent by the probe but appears on no ai.google.dev page loaded in this pass. Need: a page confirming the field, or a successful run. |

---

## Probe commands

Re-run after any change. From the repository root, in PowerShell:

```powershell
# 1. one-time setup
Copy-Item .env.example .env
#    then edit .env and set GEMINI_API_KEY

# 2. Google Gemini probe (needs GEMINI_API_KEY)
pnpm probe
#    or run each one on its own:
node scripts/probe-google.mjs
node scripts/probe-pollinations.mjs
```

Outputs land in `docs/probe/`:

- `google-generate.json` — raw image-generation response body
- `google-generate.png` — returned image bytes
- `google-vision.json` — raw vision response body
- `pollinations.png` — raw Pollinations image bytes
