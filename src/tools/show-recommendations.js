// An imperative tool that changes the page the diner is looking at. This is
// what WebMCP adds over a server-side MCP tool: the agent and the person share
// one screen.

import { logToolCall } from '../activity-log.js';
import { DISHES } from '../menu-data.js';
import { highlightPicks } from '../menu-view.js';
import { registerClearTool } from './clear-recommendations.js';

const MAX_PICKS = 5;
const MAX_REASON_LENGTH = 160;
const availableDishes = DISHES.filter((dish) => !dish.is_sold_out);

function findPicksError(picks) {
  if (!Array.isArray(picks) || picks.length === 0 || picks.length > MAX_PICKS) {
    return `picks must be an array of 1 to ${MAX_PICKS} items.`;
  }
  for (const pick of picks) {
    const dish = DISHES.find(({ id }) => id === pick?.dish_id);
    if (!dish) return `Unknown dish "${pick?.dish_id}". Use an id from search_menu.`;
    if (dish.is_sold_out) return `${dish.name} is sold out. Pick something else.`;
    if (typeof pick.reason !== 'string' || !pick.reason.trim()) {
      return `Give a reason for ${dish.id}.`;
    }
    if (pick.reason.length > MAX_REASON_LENGTH) {
      return `The reason for ${dish.id} is over ${MAX_REASON_LENGTH} characters.`;
    }
  }
  return null;
}

export const showRecommendationsTool = {
  name: 'show_recommendations',
  title: 'Show recommendations',
  description:
    'Highlight your chosen dishes on the menu the diner is looking at, each with a short reason ' +
    'written for them. Replaces any earlier picks. Choose dishes with search_menu first.',
  inputSchema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PICKS,
        items: {
          type: 'object',
          properties: {
            dish_id: { type: 'string', enum: availableDishes.map(({ id }) => id) },
            reason: {
              type: 'string',
              maxLength: MAX_REASON_LENGTH,
              description: 'One short sentence explaining why this dish suits the diner.',
            },
          },
          required: ['dish_id', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  },

  async execute(input) {
    const error = findPicksError(input.picks);
    const result = error ? { error } : { shown: input.picks.map((pick) => pick.dish_id) };
    if (!error) {
      highlightPicks(input.picks);
      await registerClearTool();
    }
    logToolCall('show_recommendations', input, result);
    return JSON.stringify(result);
  },
};
