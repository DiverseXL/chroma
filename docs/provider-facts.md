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
- No probe has been run yet. Facts marked *probe-dependent* can only be settled
  by `scripts/probe-google.mjs` / `scripts/probe-pollinations.mjs`.

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
project may be refused. The same page points to `gemini-3.5-flash-lite` and
`gemini-3.8-flash` as the recommended replacements. Whether those newer models
are vision-capable on the Interactions API is **UNCONFIRMED** — see the
register.

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
| U1 | Gemini free-tier **RPM**, **RPD**, and **IPM** for the image models | UNCONFIRMED | The live rate-limits page publishes no per-model table; it defers to the signed-in AI Studio rate-limit page. Need: the values shown at <https://aistudio.google.com/> for this project, or limit headers / a `429` body from a real `scripts/probe-google.mjs` run. |
| U2 | Pollinations **`nologo`** parameter | UNCONFIRMED | The string does not occur in `main/APIDOCS.md` or `openapi.json`. Need: either a mention in the current docs, or an observed effect in a real probe response. Do not pass it until then. |
| U3 | Pollinations numeric **rate limits** (requests/minute or /day) for a normal `sk_` key | UNCONFIRMED | Docs only give `429 RATE_LIMITED`, `Retry-After`, and the legacy `1 pollen per IP per hour`. Need: a documented limits page, the key settings at <https://enter.pollinations.ai/keys>, or measured `429` behaviour. |
| U4 | Whether Pollinations image generation can be used at **zero cost** | UNCONFIRMED | Current docs describe Pollen credits, `402 PAYMENT_REQUIRED`, and `paid_only` model filtering; no free-tier statement found. Need: a documented free allowance, or a successful keyless/`?key=` image response from the probe. |
| U5 | Exact **raw JSON wrapper** around `output_image` in the Gemini REST response | UNCONFIRMED | No doc page shows the response body. Need: `docs/probe/google-generate.json` after the first probe run; the probe walks the body for `output_image.data` rather than assuming a wrapper. |
| U6 | What `GET /image/{prompt}` returns **without** a key | UNCONFIRMED (probe-dependent) | Docs say a key is required. Need: `scripts/probe-pollinations.mjs` output (status + body). |
| U7 | Whether newer Gemini text models (e.g. `gemini-3.5-flash-lite`, `gemini-3.8-flash`) are **vision-capable** for the critic role | UNCONFIRMED | <https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash> recommends them as replacements but the vision support of each was not verified on its own model page. Need: the corresponding `ai.google.dev/gemini-api/docs/models/<id>` pages. |
| U8 | Whether a **paid** provider is required for image output (fal.ai etc.) | Out of scope | Explicitly excluded by the task: "fal.ai is out of scope for this step". |

---

## Probe commands

Neither probe has been run. From the repository root, in PowerShell:

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
