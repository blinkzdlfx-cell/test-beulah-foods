import globals from "globals";

export default [
  {
    files: ["storefront/**/*.js", "admin/**/*.js", "worker.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-func-assign": "error",
      "no-invalid-regexp": "error",
      "no-self-assign": "error",
      "no-sparse-arrays": "error",
    },
  },
];
