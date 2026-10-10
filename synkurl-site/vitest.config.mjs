// Test settings. Tests run inside Cloudflare's real Workers runtime (workerd),
// with a local, throwaway copy of the database. Nothing touches the live site.
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // The test pool's built-in runtime only knows dates up to 2026-08-22.
          // The live site keeps the date in wrangler.jsonc.
          compatibilityDate: "2026-08-22",
          bindings: {
            TEST_MIGRATIONS: migrations,
            TURNSTILE_SECRET: "test-secret",
            SITE_URL: "https://synkurl.com",
          },
          // OLD_DB is a second, empty database used to test "migration not run yet".
          d1Databases: ["DB", "OLD_DB"],
        },
      }),
    ],
    test: { setupFiles: ["./test/setup.js"] },
  };
});
