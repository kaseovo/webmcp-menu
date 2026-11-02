// The panel that lets you watch the agent. None of this is WebMCP: the tools call
// logToolCall so a read-only search, which changes nothing on screen, is still visible.
// Everything is written with textContent because tool input comes from a model.

let logElement;

function append(entry) {
  logElement.querySelector('.log-empty')?.remove();
  logElement.prepend(entry);
}

function createEntry(name, className = '') {
  const entry = document.createElement('li');
  entry.className = `log-entry ${className}`;
  const title = document.createElement('strong');
  title.textContent = name;
  entry.append(title);
  return entry;
}

function createBlock(label, value) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = label;
  const body = document.createElement('pre');
  body.textContent = JSON.stringify(value, null, 2);
  details.append(summary, body);
  return details;
}

export function logToolCall(name, input, result) {
  const entry = createEntry(name, result.error ? 'is-error' : '');
  const inputLine = document.createElement('code');
  inputLine.textContent = JSON.stringify(input);
  entry.append(inputLine);
  if (result.error) {
    const message = document.createElement('p');
    message.textContent = result.error;
    entry.append(message);
  } else {
    const count = result.dishes?.length;
    entry.append(createBlock(count === undefined ? 'Result' : `Result: ${count} dishes`, result));
  }
  append(entry);
}

export function logEvent(name, message) {
  const entry = createEntry(name, 'is-event');
  const text = document.createElement('p');
  text.textContent = message;
  entry.append(text);
  append(entry);
}

export function startActivityPanel(log, toolList) {
  logElement = log;
  const modelContext = document.modelContext;
  if (!modelContext) return;

  // getTools() includes declarative forms as well as registered tools.
  const showTools = async () => {
    const tools = await modelContext.getTools();
    toolList.replaceChildren(
      ...tools.map(({ name }) => {
        const item = document.createElement('li');
        item.textContent = name;
        return item;
      }),
    );
  };
  modelContext.addEventListener('toolchange', showTools);
  showTools();
}
