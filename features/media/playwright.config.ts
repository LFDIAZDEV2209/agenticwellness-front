import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

/** QA del carril media sin modificar los E2E compartidos con otros agentes. */
export default defineConfig({
  ...base,
  testDir: "./tests",
  outputDir: "../../test-results/media-118",
  reporter: "list",
  projects: [{ name: "chromium-desktop", use: { viewport: { width: 1440, height: 900 } } }],
});
