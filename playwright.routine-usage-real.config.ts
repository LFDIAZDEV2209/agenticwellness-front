import { defineConfig } from "@playwright/test";
import base from "./playwright.routine-edit.config";
export default defineConfig({ ...base, testMatch: ["routine-usage-real.spec.ts"],
  outputDir: "qa-reports/routine-usage-final/real-tests", reporter: [["list"], ["json", { outputFile: "qa-reports/routine-usage-final/real-playwright.json" }]],
});
