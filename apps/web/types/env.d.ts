/**
 * Environment variables the web app (and the workspace packages it bundles)
 * reads at runtime.
 *
 * Next.js ships its own `NodeJS.ProcessEnv` declaration that only contains
 * `NODE_ENV`, which hides the rest of the variables from TypeScript and trips
 * the weak-type check whenever an adapter does `readConfig(process.env)`.
 * Re-declaring them here merges them back into `ProcessEnv` for this app's
 * type-check only.
 */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly CF_WORKER_URL?: string;
      readonly CF_API_KEY?: string;
      readonly GEMINI_API_KEY?: string;
      readonly GOOGLE_MODEL_TEXT?: string;
      readonly GOOGLE_MODEL_VISION?: string;
      readonly KIE_API_KEY?: string;
      readonly KIE_BASE_URL?: string;
      readonly KIE_MODEL?: string;
      readonly POLLINATIONS_API_KEY?: string;
      readonly DATABASE_URL?: string;
      readonly DIRECT_URL?: string;
      readonly POSTGRES_URL?: string;
    }
  }
}

export {};
