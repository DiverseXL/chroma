/**
 * Cached demo run entry point.
 *
 * The landing page's "Watch a demo run" button and the /run page's
 * cached-demo mode both compare against DEMO_RUN_ID. Replace the placeholder
 * with the id of a completed run (printed by the runs API / shown in the URL
 * when viewing that run).
 */
export const DEMO_RUN_ID = "REPLACE_WITH_REAL_RUN_ID";

/**
 * Explanation shown in place of live-run controls while a cached demo is open.
 */
export const DEMO_RUN_HINT =
  "Live runs are rate-limited to protect resources. Explore this cached run instead.";
