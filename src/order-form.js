// The JavaScript half of the declarative place_order tool. The tool itself is
// the toolname and tooldescription attributes on the form in index.html.
//
// That form has no toolautosubmit attribute, so an agent can fill it in but only
// the diner can send it. The agent's call stays open until they decide:
// Send order resolves it, and Cancel (a form reset) rejects it.

import { logEvent, logToolCall } from './activity-log.js';
import { DISHES, RESTAURANT } from './menu-data.js';
import { formatPrice } from './menu-view.js';

function readOrder(form) {
  const data = new FormData(form);
  const dishes = data.getAll('dishes').map((id) => DISHES.find((dish) => dish.id === id));
  return {
    table: Number(data.get('table')),
    dishes: dishes.map(({ id, name, price }) => ({ id, name, price })),
    total: dishes.reduce((sum, dish) => sum + dish.price, 0),
    currency: RESTAURANT.currency,
  };
}

export function setUpOrderForm(form, summary, confirmation) {
  let waitingForDiner = false;

  const updateSummary = () => {
    const { dishes, total } = readOrder(form);
    summary.textContent = dishes.length
      ? `${dishes.map((dish) => dish.name).join(', ')}: ${formatPrice(total)}`
      : 'Nothing selected yet.';
  };
  form.addEventListener('change', updateSummary);
  // The reset has not cleared the fields yet when this event fires.
  form.addEventListener('reset', () => {
    // In Chrome 156 a reset rejects the agent's call but does not fire toolcancel,
    // so the form's own reset event is the way to see the diner cancelling.
    if (waitingForDiner) logEvent('place_order', 'The diner cancelled.');
    waitingForDiner = false;
    confirmation.hidden = true;
    setTimeout(updateSummary);
  });
  updateSummary();

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // There is no server, so stay on the page.
    waitingForDiner = false;
    const order = readOrder(form);
    confirmation.textContent =
      `Pretend order sent for table ${order.table}: ` +
      `${order.dishes.map((dish) => dish.name).join(', ')}. Total ${formatPrice(order.total)}.`;
    confirmation.hidden = false;
    if (event.agentInvoked) {
      // This value becomes the result of the agent's tool call.
      event.respondWith(Promise.resolve(JSON.stringify({ status: 'sent', ...order })));
      logToolCall('place_order', { table: order.table, dishes: order.dishes.map(({ id }) => id) }, order);
    }
  });

  // These fire on document.modelContext, not on the form.
  document.modelContext?.addEventListener('toolactivated', ({ toolName }) => {
    if (toolName !== 'place_order') return;
    waitingForDiner = true;
    updateSummary();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    logEvent('place_order', 'The agent filled in the form. Waiting for the diner.');
  });
  // Fires when the agent abandons its own call.
  document.modelContext?.addEventListener('toolcancel', ({ toolName }) => {
    if (toolName !== 'place_order') return;
    waitingForDiner = false;
    logEvent('place_order', 'The agent cancelled its request.');
  });
}
