// Runs the page in real Chrome with the WebMCP flag on, and calls its tools the
// way an agent would, through getTools() and executeTool().
// Set CHROME_PATH if Chrome is not in the usual macOS location.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { serve } from '../scripts/serve.mjs';
import { DISHES } from '../src/menu-data.js';
import { formatPrice } from '../src/menu-view.js';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9444;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let server;
let chrome;
let profile;
let socket;
let nextId = 0;
const waiting = new Map();
const pageErrors = [];

function send(method, params = {}) {
  return new Promise((done) => {
    const id = ++nextId;
    waiting.set(id, done);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}

const toolNames = () =>
  evaluate(`document.modelContext.getTools().then((tools) => tools.map((tool) => tool.name))`);

// Calls a tool like an agent would and parses the JSON string it returns.
async function callTool(name, input = {}) {
  const raw = await evaluate(`(async () => {
    const tools = await document.modelContext.getTools();
    const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(name)});
    return document.modelContext.executeTool(tool, ${JSON.stringify(input)});
  })()`);
  return JSON.parse(raw);
}

// Starts an agent call to place_order without waiting for it to finish.
async function startOrder(input) {
  await evaluate(`(async () => {
    const tools = await document.modelContext.getTools();
    const tool = tools.find((candidate) => candidate.name === 'place_order');
    window.orderCall = { state: 'waiting' };
    document.modelContext.executeTool(tool, ${JSON.stringify(input)}).then(
      (value) => { window.orderCall = { state: 'resolved', value }; },
      (error) => { window.orderCall = { state: 'rejected', message: error.message }; },
    );
  })()`);
  await sleep(300);
}

before(async () => {
  server = await serve();
  profile = mkdtempSync(join(tmpdir(), 'webmcp-menu-'));
  // The same setting as turning the flag on in chrome://flags.
  writeFileSync(
    join(profile, 'Local State'),
    JSON.stringify({ browser: { enabled_labs_experiments: ['enable-webmcp-testing@1'] } }),
  );
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let targets;
  for (let attempt = 0; attempt < 40 && !targets; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
    } catch {
      await sleep(250);
    }
  }
  assert.ok(targets, 'Chrome did not start. Set CHROME_PATH if it is somewhere else.');

  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((done) => (socket.onopen = done));
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (waiting.has(message.id)) {
      waiting.get(message.id)(message.result);
      waiting.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.text);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      pageErrors.push(message.params.entry.text);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: `http://localhost:${server.address().port}/` });
  await sleep(1000);
});

after(async () => {
  socket?.close();
  chrome?.kill();
  server?.close();
  await sleep(300);
  if (profile) rmSync(profile, { recursive: true, force: true });
});

test('the API is on document, and navigator no longer has it', async () => {
  assert.equal(await evaluate(`'modelContext' in document`), true);
  assert.equal(await evaluate(`'modelContext' in navigator`), false);
});

test('the page starts with three tools, with no setup banner', async () => {
  assert.deepEqual(await toolNames(), ['place_order', 'search_menu', 'show_recommendations']);
  assert.equal(await evaluate(`document.querySelector('#setup-banner').hidden`), true);
});

test('search_menu is marked read-only and show_recommendations is not', async () => {
  const hints = await evaluate(`document.modelContext.getTools().then((tools) =>
    Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint])))`);
  assert.equal(hints.search_menu, true);
  assert.ok(!hints.show_recommendations);
});

test('search_menu filters dishes and leaves the page alone', async () => {
  const { dishes } = await callTool('search_menu', {
    course: 'main',
    exclude_allergens: ['crustaceans'],
    max_spice: 2,
    max_price: 25,
  });
  assert.ok(dishes.length > 0);
  for (const dish of dishes) {
    assert.equal(dish.course, 'main');
    assert.ok(!dish.allergens.includes('crustaceans'));
    assert.ok(dish.spice_level <= 2 && dish.price <= 25);
    assert.ok(dish.ingredients.length > 0, 'results should be full dish records');
  }
  assert.equal(await evaluate(`document.querySelectorAll('.dish.is-picked').length`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('.dish').length`), 20);
});

test('search_menu returns a useful error for an unknown allergen', async () => {
  const { error, dishes } = await callTool('search_menu', { exclude_allergens: ['nuts'] });
  assert.match(error, /Unknown allergen "nuts"/);
  assert.equal(dishes, undefined);
});

test('show_recommendations refuses unknown and sold-out dishes and changes nothing', async () => {
  for (const dish_id of ['not-a-dish', 'gado-gado']) {
    const { error } = await callTool('show_recommendations', { picks: [{ dish_id, reason: 'x' }] });
    assert.equal(typeof error, 'string', dish_id);
  }
  assert.equal(await evaluate(`document.querySelectorAll('.dish.is-picked').length`), 0);
  assert.ok(!(await toolNames()).includes('clear_recommendations'));
});

test('show_recommendations highlights picks and adds the clear tool', async () => {
  const markup = '<img src=x onerror="window.injected = true">';
  const { shown } = await callTool('show_recommendations', {
    picks: [
      { dish_id: 'beef-rendang', reason: 'Deep and warming.' },
      { dish_id: 'cendol', reason: markup },
    ],
  });
  await sleep(100);
  assert.deepEqual(shown, ['beef-rendang', 'cendol']);
  assert.equal(await evaluate(`document.querySelectorAll('.dish.is-picked').length`), 2);
  assert.ok((await toolNames()).includes('clear_recommendations'));

  // A reason is shown as text, even when it looks like HTML.
  const reason = `document.querySelector('[data-dish-id="cendol"] .dish-reason')`;
  assert.equal(await evaluate(`${reason}.textContent`), markup);
  assert.equal(await evaluate(`${reason}.children.length`), 0);
  assert.equal(await evaluate(`window.injected === undefined`), true);
});

test('new picks replace the old ones', async () => {
  await callTool('show_recommendations', { picks: [{ dish_id: 'laksa', reason: 'Fiery.' }] });
  assert.deepEqual(
    await evaluate(`[...document.querySelectorAll('.dish.is-picked')].map((card) => card.dataset.dishId)`),
    ['laksa'],
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-dish-id="cendol"] .dish-reason').textContent`),
    '',
  );
});

test('clear_recommendations removes the picks and then removes itself', async () => {
  assert.deepEqual(await callTool('clear_recommendations'), { cleared: true });
  await sleep(100);
  assert.equal(await evaluate(`document.querySelectorAll('.dish.is-picked').length`), 0);
  assert.ok(!(await toolNames()).includes('clear_recommendations'));
  assert.equal(await evaluate(`document.querySelector('#picks-bar').hidden`), true);
});

test('the Clear button also removes the clear tool', async () => {
  await callTool('show_recommendations', { picks: [{ dish_id: 'laksa', reason: 'Fiery.' }] });
  await sleep(100);
  assert.ok((await toolNames()).includes('clear_recommendations'));
  await evaluate(`document.querySelector('#clear-picks').click()`);
  await sleep(100);
  assert.ok(!(await toolNames()).includes('clear_recommendations'));
});

test('the order form schema is built from the form, with every available dish', async () => {
  const schema = await evaluate(`document.modelContext.getTools().then((tools) =>
    tools.find((tool) => tool.name === 'place_order').inputSchema)`);
  const available = DISHES.filter((dish) => !dish.is_sold_out);
  assert.deepEqual(schema.required.sort(), ['dishes', 'table']);
  assert.equal(schema.properties.table.type, 'number');
  assert.equal(schema.properties.dishes.type, 'array');
  assert.deepEqual(schema.properties.dishes.items.enum, available.map((dish) => dish.id));
});

test('the hand-written order options match the menu data', async () => {
  const options = await evaluate(`[...document.querySelector('#order-dishes').options].map(
    (option) => ({ id: option.value, label: option.textContent }))`);
  assert.deepEqual(
    options,
    DISHES.filter((dish) => !dish.is_sold_out).map((dish) => ({
      id: dish.id,
      label: `${dish.name} (${formatPrice(dish.price)})`,
    })),
  );
});

test('the order form has no optgroup, which sends agent choices to the wrong options', async () => {
  assert.equal(await evaluate(`document.querySelectorAll('#order-form optgroup').length`), 0);
});

test('place_order waits for the diner, and Send order returns the order to the agent', async () => {
  await startOrder({ table: 4, dishes: ['beef-rendang', 'cendol'] });
  const order = await evaluate(`({
    state: window.orderCall.state,
    table: document.querySelector('#order-table').value,
    dishes: [...document.querySelector('#order-dishes').selectedOptions].map((option) => option.value),
    active: document.querySelector('#order-form').matches(':tool-form-active'),
    summary: document.querySelector('#order-summary').textContent,
    confirmed: !document.querySelector('#order-confirmation').hidden,
  })`);
  assert.equal(order.state, 'waiting', 'the call must not finish before the diner acts');
  assert.equal(order.table, '4');
  assert.deepEqual(order.dishes, ['beef-rendang', 'cendol']);
  assert.equal(order.active, true);
  assert.match(order.summary, /S\$34/);
  assert.equal(order.confirmed, false);

  await evaluate(`document.querySelector('#order-form button[type=submit]').click()`);
  await sleep(200);
  const call = await evaluate(`window.orderCall`);
  assert.equal(call.state, 'resolved');
  const result = JSON.parse(call.value);
  assert.equal(result.status, 'sent');
  assert.equal(result.table, 4);
  assert.equal(result.total, 34);
  assert.equal(await evaluate(`document.querySelector('#order-confirmation').hidden`), false);
});

test('Cancel rejects the agent call and shows it in the activity log', async () => {
  await evaluate(`document.querySelector('#order-form').reset()`);
  await sleep(100);
  await startOrder({ table: 2, dishes: ['laksa'] });
  await evaluate(`document.querySelector('#order-form button[type=reset]').click()`);
  await sleep(200);
  const call = await evaluate(`window.orderCall`);
  assert.equal(call.state, 'rejected');
  assert.match(await evaluate(`document.querySelector('#activity-log li').textContent`), /cancelled/);
  assert.equal(await evaluate(`document.querySelector('#order-confirmation').hidden`), true);
  assert.equal(await evaluate(`document.querySelector('#order-table').value`), '');
  assert.equal(await evaluate(`document.querySelector('#order-dishes').selectedOptions.length`), 0);
});

test('a person can order without an agent', async () => {
  await evaluate(`(() => {
    document.querySelector('#order-table').value = '7';
    document.querySelector('#order-dishes option[value="teh-tarik"]').selected = true;
    document.querySelector('#order-form button[type=submit]').click();
  })()`);
  await sleep(100);
  assert.match(
    await evaluate(`document.querySelector('#order-confirmation').textContent`),
    /table 7: Teh tarik\. Total S\$5/,
  );
});

test('the page logged no errors', () => {
  assert.deepEqual(pageErrors, []);
});
