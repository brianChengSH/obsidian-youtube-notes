import tsParser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default [
	{
		ignores: [
			"node_modules/**",
			"main.js",
			"dist/**",
			"images/**",
			"*.mjs",
			"package.json",
			"package-lock.json",
			"versions.json",
			"tsconfig.json",
			"src/__tests__/**",
			"src/bookmarklet.js",
			"scripts/**",
		],
	},
	...tseslint.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.{ts,tsx}"],
	})),
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.{ts,tsx}"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: "./tsconfig.json",
				sourceType: "module",
			},
			globals: {
				...globals.browser,
				activeDocument: "readonly",
				activeWindow: "readonly",
			},
		},
		rules: {
			"no-console": ["error", { allow: ["warn", "error", "debug"] }],
			"obsidianmd/prefer-active-doc": "error",
			"@typescript-eslint/no-unused-vars": ["error", {
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
			}],
		},
	},
];
