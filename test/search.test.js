import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALLERGENS, COURSES, DIET_TAGS, DISHES, MAX_SPICE } from '../src/menu-data.js';
import { findInputError, searchDishes } from '../src/search.js';

const ids = (dishes) => dishes.map((dish) => dish.id);

test('no dish containing an excluded allergen is ever returned, for every allergen', () => {
  for (const allergen of ALLERGENS) {
    const results = searchDishes(DISHES, { exclude_allergens: [allergen] });
    assert.ok(results.length > 0, `excluding ${allergen} should still leave something to eat`);
    for (const dish of results) {
      assert.ok(!dish.allergens.includes(allergen), `${dish.id} contains ${allergen}`);
    }
  }
});

test('excluding several allergens excludes dishes containing any of them', () => {
  const results = searchDishes(DISHES, { exclude_allergens: ['peanuts', 'crustaceans'] });
  assert.ok(!ids(results).includes('rojak'));
  assert.ok(!ids(results).includes('laksa'));
  assert.ok(ids(results).includes('beef-rendang'));
});

test('sold-out dishes are always left out', () => {
  assert.ok(DISHES.some((dish) => dish.is_sold_out), 'the menu should have a sold-out dish to test');
  assert.ok(searchDishes(DISHES).every((dish) => !dish.is_sold_out));
});

test('every requested diet tag must be present', () => {
  const results = searchDishes(DISHES, { diet_tags: ['vegan', 'gluten_free'] });
  assert.ok(results.length > 0);
  for (const dish of results) {
    assert.ok(dish.diet_tags.includes('vegan') && dish.diet_tags.includes('gluten_free'));
  }
});

test('course, price and spice limits are inclusive filters', () => {
  assert.ok(searchDishes(DISHES, { course: 'drink' }).every((dish) => dish.course === 'drink'));
  assert.ok(ids(searchDishes(DISHES, { max_price: 26 })).includes('beef-rendang'));
  assert.ok(!ids(searchDishes(DISHES, { max_price: 25 })).includes('beef-rendang'));
  assert.ok(searchDishes(DISHES, { max_spice: 0 }).every((dish) => dish.spice_level === 0));
});

test('an impossible combination returns an empty list, not an error', () => {
  assert.deepEqual(searchDishes(DISHES, { course: 'drink', max_price: 1 }), []);
});

test('valid input, including no input at all, has no error', () => {
  assert.equal(findInputError({}), null);
  assert.equal(
    findInputError({
      course: 'main',
      diet_tags: ['halal'],
      exclude_allergens: ['soy'],
      max_price: 20,
      max_spice: 0,
    }),
    null,
  );
});

test('an unknown allergen is rejected instead of being silently ignored', () => {
  const error = findInputError({ exclude_allergens: ['nuts'] });
  assert.match(error, /Unknown allergen "nuts"/);
  assert.match(error, /peanuts/, 'the error should list the valid values so the agent can retry');
});

test('other malformed input is rejected', () => {
  for (const input of [
    { course: 'brunch' },
    { diet_tags: ['paleo'] },
    { diet_tags: 'vegan' },
    { exclude_allergens: 'peanuts' },
    { max_price: -1 },
    { max_price: '20' },
    { max_spice: 4 },
    { max_spice: 1.5 },
  ]) {
    assert.equal(typeof findInputError(input), 'string', JSON.stringify(input));
  }
});

test('the menu only uses values the tool schema allows', () => {
  const seen = new Set();
  for (const dish of DISHES) {
    assert.ok(!seen.has(dish.id), `duplicate id ${dish.id}`);
    seen.add(dish.id);
    assert.ok(COURSES.includes(dish.course), dish.id);
    assert.ok(dish.allergens.every((allergen) => ALLERGENS.includes(allergen)), dish.id);
    assert.ok(dish.diet_tags.every((tag) => DIET_TAGS.includes(tag)), dish.id);
    assert.ok(dish.spice_level >= 0 && dish.spice_level <= MAX_SPICE, dish.id);
  }
});

test('diet tags do not contradict the allergens on the same dish', () => {
  for (const dish of DISHES) {
    if (dish.diet_tags.includes('gluten_free')) {
      assert.ok(!dish.allergens.includes('gluten'), `${dish.id} is tagged gluten_free`);
    }
    if (dish.diet_tags.includes('vegan')) {
      for (const animal of ['crustaceans', 'egg', 'fish', 'milk', 'molluscs']) {
        assert.ok(!dish.allergens.includes(animal), `${dish.id} is tagged vegan but has ${animal}`);
      }
    }
    if (dish.diet_tags.includes('vegetarian')) {
      for (const animal of ['crustaceans', 'fish', 'molluscs']) {
        assert.ok(!dish.allergens.includes(animal), `${dish.id} is tagged vegetarian but has ${animal}`);
      }
    }
  }
});
