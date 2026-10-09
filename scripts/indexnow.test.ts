import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { submitIndexNow, urlsFromSitemap } from "./indexnow.js";

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sheetwrite.vercel.app/</loc></url>
  <url><loc>https://sheetwrite.vercel.app/docs/start/installation/</loc></url>
  <url><loc>https://sheetwrite.vercel.app/docs/start/installation/</loc></url>
</urlset>`;

describe("IndexNow discovery submission", () => {
  it("extracts unique canonical production URLs from the generated sitemap", () => {
    expect(urlsFromSitemap(sitemap)).toEqual([
      "https://sheetwrite.vercel.app/",
      "https://sheetwrite.vercel.app/docs/start/installation/",
    ]);
    expect(() =>
      urlsFromSitemap(
        sitemap.replace(
          "https://sheetwrite.vercel.app/docs/start/installation/",
          "https://attacker.example/docs/",
        ),
      ),
    ).toThrow("outside https://sheetwrite.vercel.app");
  });

  it("posts a verifiable key and accepts only successful IndexNow responses", async () => {
    const urls = urlsFromSitemap(sitemap);
    let request: { url: string; method?: string; body: Record<string, unknown> } | undefined;
    for (const status of [200, 202]) {
      const accepted = await submitIndexNow(urls, async (input, init) => {
        request = {
          url: String(input),
          method: init?.method,
          body: JSON.parse(String(init?.body)),
        };
        return new Response(null, { status });
      });
      expect(accepted).toBe(urls.length);
    }
    expect(request).toMatchObject({
      url: "https://api.indexnow.org/indexnow",
      method: "POST",
      body: { host: "sheetwrite.vercel.app", urlList: urls },
    });
    // IndexNow verifies ownership by fetching keyLocation; the deployed file must hold the key.
    const { key, keyLocation } = request!.body as { key: string; keyLocation: string };
    const keyFile = new URL(keyLocation);
    expect(keyFile.origin).toBe("https://sheetwrite.vercel.app");
    const served = readFileSync(
      new URL(`../docs/public${keyFile.pathname}`, import.meta.url),
      "utf8",
    );
    expect(served.trim()).toBe(key);

    for (const status of [204, 422, 500]) {
      await expect(
        submitIndexNow(urls, async () => new Response(null, { status })),
        String(status),
      ).rejects.toThrow(String(status));
    }
  });
});
