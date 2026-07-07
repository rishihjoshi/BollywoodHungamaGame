import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["docs/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      globals: {
        ...globals.browser,
        showAbandonModal: "readonly",
        goTo: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-undef": "warn",
      "no-console": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
  {
    // Node-side files: build script, Playwright config, and E2E specs.
    files: ["scripts/**/*.js", "playwright.config.js", "e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        fetch: "readonly", // Node 18+ global
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-console": "off",
    },
  },
];
