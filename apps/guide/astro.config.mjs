import { defineConfig } from "astro/config";

// 公開URLが決まったら site を設定する(例: https://mimpaku-demo.pages.dev)
export default defineConfig({
  output: "static",
  trailingSlash: "always",
});
