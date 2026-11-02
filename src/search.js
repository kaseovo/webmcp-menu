// The hard rules behind search_menu. No WebMCP and no DOM here, so the part
// that must never be wrong can be unit tested in plain Node.

import { ALLERGENS, COURSES, DIET_TAGS, MAX_SPICE } from './menu-data.js';

// Chrome does not check tool input against inputSchema before calling execute.
// Without this, a typo like exclude_allergens: ["nuts"] would match nothing,
// exclude nothing, and return dishes the diner cannot eat.
export function findInputError({ course, diet_tags, exclude_allergens, max_price, max_spice }) {
  if (course !== undefined && !COURSES.includes(course)) {
    return `Unknown course "${course}". Use one of: ${COURSES.join(', ')}.`;
  }
  if (diet_tags !== undefined) {
    if (!Array.isArray(diet_tags)) return 'diet_tags must be an array.';
    const unknown = diet_tags.find((tag) => !DIET_TAGS.includes(tag));
    if (unknown !== undefined) return `Unknown diet tag "${unknown}". Use: ${DIET_TAGS.join(', ')}.`;
  }
  if (exclude_allergens !== undefined) {
    if (!Array.isArray(exclude_allergens)) return 'exclude_allergens must be an array.';
    const unknown = exclude_allergens.find((allergen) => !ALLERGENS.includes(allergen));
    if (unknown !== undefined) {
      return `Unknown allergen "${unknown}". Use: ${ALLERGENS.join(', ')}.`;
    }
  }
  if (max_price !== undefined && !(typeof max_price === 'number' && max_price >= 0)) {
    return 'max_price must be a number of 0 or more.';
  }
  if (max_spice !== undefined && !(Number.isInteger(max_spice) && max_spice >= 0 && max_spice <= MAX_SPICE)) {
    return `max_spice must be a whole number from 0 to ${MAX_SPICE}.`;
  }
  return null;
}

export function searchDishes(dishes, filters = {}) {
  const { course, diet_tags = [], exclude_allergens = [], max_price, max_spice } = filters;
  return dishes.filter(
    (dish) =>
      !dish.is_sold_out &&
      (course === undefined || dish.course === course) &&
      diet_tags.every((tag) => dish.diet_tags.includes(tag)) &&
      !exclude_allergens.some((allergen) => dish.allergens.includes(allergen)) &&
      (max_price === undefined || dish.price <= max_price) &&
      (max_spice === undefined || dish.spice_level <= max_spice),
  );
}
