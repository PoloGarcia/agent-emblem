import type { AgentEmblemPreset } from "./types";

/**
 * Simple, logo-free marks that can be passed through the `preset` prop.
 * They deliberately use solid silhouettes so they stay legible after particle
 * sampling at compact UI sizes.
 */
export const agentEmblemPresets: Record<AgentEmblemPreset, string> = {
  circle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>',
  square: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="9" y="9" width="82" height="82" rx="4"/></svg>',
  spark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4c3 26 20 43 46 46-26 3-43 20-46 46C47 70 30 53 4 50 30 47 47 30 50 4Z"/></svg>',
  cursor: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M23 14 78 57 52 62 39 87Z" stroke="#000" stroke-width="9" stroke-linejoin="round"/></svg>',
};
