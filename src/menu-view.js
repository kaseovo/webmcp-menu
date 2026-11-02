// Draws the menu and the agent's picks. No WebMCP in this file.

import { COURSES, DISHES, MAX_SPICE } from './menu-data.js';

const COURSE_TITLES = { starter: 'Starters', main: 'Mains', dessert: 'Desserts', drink: 'Drinks' };

export const courseTitle = (course) => COURSE_TITLES[course];
export const formatPrice = (price) => `S$${price}`;

let picksBar;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const labelOf = (value) => value.replaceAll('_', ' ');

function renderDish(dish) {
  const card = element('article', 'dish');
  card.dataset.dishId = dish.id;
  card.classList.toggle('is-sold-out', dish.is_sold_out);

  const heading = element('div', 'dish-heading');
  heading.append(element('h3', '', dish.name), element('span', 'dish-price', formatPrice(dish.price)));

  const badges = element('p', 'dish-badges');
  if (dish.is_sold_out) badges.append(element('span', 'badge badge-sold-out', 'Sold out'));
  if (dish.is_chefs_pick) badges.append(element('span', 'badge badge-chef', "Chef's pick"));
  for (const tag of dish.diet_tags) badges.append(element('span', 'badge', labelOf(tag)));

  const facts = element('p', 'dish-facts');
  const spice = `Spice ${'●'.repeat(dish.spice_level)}${'○'.repeat(MAX_SPICE - dish.spice_level)}`;
  const rating = `★ ${dish.rating.toFixed(1)} (${dish.review_count})`;
  facts.textContent = [spice, rating].join(' · ');

  const allergens = element(
    'p',
    'dish-allergens',
    dish.allergens.length ? `Contains ${dish.allergens.map(labelOf).join(', ')}` : 'No listed allergens',
  );

  const reason = element('p', 'dish-reason');
  reason.hidden = true;

  card.append(heading, element('p', 'dish-description', dish.description), badges, facts, allergens, reason);
  return card;
}

export function renderMenu(container, bar) {
  picksBar = bar;
  for (const course of COURSES) {
    const section = element('section', 'course');
    section.append(element('h2', '', courseTitle(course)));
    const list = element('div', 'course-dishes');
    for (const dish of DISHES) {
      if (dish.course === course) list.append(renderDish(dish));
    }
    section.append(list);
    container.append(section);
  }
}

export function highlightPicks(picks) {
  clearHighlights();
  const cards = picks.map(({ dish_id, reason }) => {
    const card = document.querySelector(`[data-dish-id="${CSS.escape(dish_id)}"]`);
    const reasonElement = card.querySelector('.dish-reason');
    // Written by a model, so it goes in as text and never as HTML.
    reasonElement.textContent = reason;
    reasonElement.hidden = false;
    card.classList.add('is-picked');
    return card;
  });
  picksBar.querySelector('[data-picks-count]').textContent =
    picks.length === 1 ? '1 pick from your agent' : `${picks.length} picks from your agent`;
  picksBar.hidden = false;
  cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function clearHighlights() {
  for (const card of document.querySelectorAll('.dish.is-picked')) {
    card.classList.remove('is-picked');
    const reasonElement = card.querySelector('.dish-reason');
    reasonElement.textContent = '';
    reasonElement.hidden = true;
  }
  picksBar.hidden = true;
}
