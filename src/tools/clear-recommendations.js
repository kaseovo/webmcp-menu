// A tool that only exists while it means something. It is registered when picks
// appear and removed when they go, so an agent never sees an action it cannot take.
//
// Unregistering is done by aborting the signal passed to registerTool. Every
// change to the tool list fires a toolchange event on document.modelContext.

import { logToolCall } from '../activity-log.js';
import { clearHighlights } from '../menu-view.js';

let registration = null;

const clearRecommendationsTool = {
  name: 'clear_recommendations',
  title: 'Clear recommendations',
  description: 'Remove the highlighted recommendations from the menu.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },

  async execute(input) {
    clearRecommendations();
    const result = { cleared: true };
    logToolCall('clear_recommendations', input, result);
    return JSON.stringify(result);
  },
};

export async function registerClearTool() {
  if (registration) return;
  registration = new AbortController();
  await document.modelContext.registerTool(clearRecommendationsTool, {
    signal: registration.signal,
  });
}

// Also called by the Clear button, so the tool goes away however the picks do.
export function clearRecommendations() {
  clearHighlights();
  registration?.abort();
  registration = null;
}
