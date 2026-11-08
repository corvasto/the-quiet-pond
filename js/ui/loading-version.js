import { APP_VERSION } from '../config/app.js';

// Populate the splash without waiting for the game runtime's dependency graph.
document.querySelectorAll('[data-app-version]').forEach((element) => {
  element.textContent = `Version ${APP_VERSION}`;
});
