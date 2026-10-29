import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/pull-list-sorter/" : "/",
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
