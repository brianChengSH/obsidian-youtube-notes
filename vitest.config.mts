import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(__dirname, "src/__tests__/mocks/obsidian.ts"),
		},
	},
});
