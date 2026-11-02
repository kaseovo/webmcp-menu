import { startActivityPanel } from './activity-log.js';
import { renderMenu } from './menu-view.js';
import { setUpOrderForm } from './order-form.js';
import { clearRecommendations } from './tools/clear-recommendations.js';
import { searchMenuTool } from './tools/search-menu.js';
import { showRecommendationsTool } from './tools/show-recommendations.js';

renderMenu(document.querySelector('#menu'), document.querySelector('#picks-bar'));
document.querySelector('#clear-picks').addEventListener('click', clearRecommendations);
setUpOrderForm(
  document.querySelector('#order-form'),
  document.querySelector('#order-summary'),
  document.querySelector('#order-confirmation'),
);
startActivityPanel(document.querySelector('#activity-log'), document.querySelector('#tool-list'));

// The page must keep working for people when WebMCP is missing.
if ('modelContext' in document) {
  await document.modelContext.registerTool(searchMenuTool);
  await document.modelContext.registerTool(showRecommendationsTool);
} else {
  document.querySelector('#setup-banner').hidden = false;
}
