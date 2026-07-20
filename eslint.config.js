import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {ignores: ["build/**", ".react-router/**", "node_modules/**"]},
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname},
      globals: {...globals.browser, ...globals.node},
    },
    rules: {"@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_"}]},
  },
);
