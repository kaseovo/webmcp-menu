// An imperative tool: plain data in, plain data out.
//
// readOnlyHint tells the agent this call changes nothing, so it is safe to run
// as often as it likes. That is why searching does not touch the menu on screen.

import { logToolCall } from '../activity-log.js';
import { ALLERGENS, COURSES, DIET_TAGS, DISHES, MAX_SPICE, RESTAURANT } from '../menu-data.js';
import { findInputError, searchDishes } from '../search.js';

export const searchMenuTool = {
  name: 'search_menu',
  title: 'Search the menu',
  description:
    'Find dishes at this restaurant. Pass every allergy and diet the diner mentioned: this is ' +
    'the only reliable source for allergens, so never guess them from a dish name. Sold-out ' +
    'dishes are never returned, so a dish the diner names but you cannot find may be sold out. ' +
    'Returns full dish records, including description and ingredients, so you can judge taste ' +
    'yourself. Call with no arguments for the whole menu.',
  inputSchema: {
    type: 'object',
    properties: {
      course: { type: 'string', enum: COURSES, description: 'Only this course.' },
      diet_tags: {
        type: 'array',
        items: { type: 'string', enum: DIET_TAGS },
        description: 'Only dishes that have all of these tags.',
      },
      exclude_allergens: {
        type: 'array',
        items: { type: 'string', enum: ALLERGENS },
        description: 'Leave out any dish containing one of these.',
      },
      max_price: {
        type: 'number',
        minimum: 0,
        description: `Highest price per dish, in ${RESTAURANT.currency}.`,
      },
      max_spice: {
        type: 'integer',
        minimum: 0,
        maximum: MAX_SPICE,
        description: `Hottest dish allowed, from 0 (not spicy) to ${MAX_SPICE} (very spicy).`,
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },

  async execute(input) {
    const error = findInputError(input);
    const result = error
      ? { error }
      : {
          currency: RESTAURANT.currency,
          dishes: searchDishes(DISHES, input).map(({ is_sold_out, ...dish }) => dish),
        };
    logToolCall('search_menu', input, result);
    // Return errors as values. If execute throws, the agent only gets a generic
    // failure and never sees the message it would need to correct its call.
    return JSON.stringify(result);
  },
};
