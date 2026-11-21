// Records each browser's own error text for the ways a WASM load fails, through
// the same path as the wasm-bindgen loader Sheetwrite ships: instantiateStreaming,
// and on a wrong MIME type a fallback to instantiate(bytes).
// Usage: node probe.mjs <playwright module path> <chromium|firefox|webkit>
const [pwPath, name] = process.argv.slice(2);
const pw = await import(pwPath);
const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const HTML = "<!doctype html><title>Not here</title>";
const scenarios = {
  "404 on the .wasm": { status: 404, type: "text/html", body: HTML },
  "HTML served as the .wasm (200)": { status: 200, type: "text/html", body: HTML },
  "wrong MIME type (application/octet-stream)": { status: 200, type: "application/octet-stream", body: WASM },
  "CSP without 'wasm-unsafe-eval'": { status: 200, type: "application/wasm", body: WASM, csp: "script-src 'self' 'unsafe-inline'" },
  "network failure": { abort: true },
};
const loader = `
async function load(url) {
  const response = fetch(url);
  try {
    return await WebAssembly.instantiateStreaming(response, {});
  } catch (e) {
    const r = await response;
    const valid = r.ok && ["basic", "cors", "default"].includes(r.type);
    if (valid && r.headers.get("Content-Type") !== "application/wasm") {
      window.__warn = String(e);
    } else { throw e; }
    return await WebAssembly.instantiate(await r.arrayBuffer(), {});
  }
}`;
const browser = await pw[name].launch();
for (const [label, s] of Object.entries(scenarios)) {
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`); });
  await page.route("http://probe.test/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      return route.fulfill({ status: 200, contentType: "text/html", headers: s.csp ? { "content-security-policy": s.csp } : {}, body: `<!doctype html><script>${loader}</script>` });
    }
    if (s.abort) return route.abort("failed");
    return route.fulfill({ status: s.status, contentType: s.type, body: s.body });
  });
  await page.goto("http://probe.test/");
  const result = await page.evaluate(async () => {
    try { await load("/sheetwrite_wasm_bg.wasm"); return { ok: true, warn: window.__warn ?? null }; }
    catch (e) { return { ok: false, error: `${e.name}: ${e.message}`, warn: window.__warn ?? null }; }
  });
  console.log(JSON.stringify({ browser: name, scenario: label, ...result, console: logs.slice(0, 2) }));
  await page.close();
}
await browser.close();
