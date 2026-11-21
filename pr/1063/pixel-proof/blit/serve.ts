// serve.ts <port>: the proof page, its bundle, the core stylesheet and the engine file.
const [port] = process.argv.slice(2);
const root = "/home/vvin/learn/perfdeep/blit";
const checkout = "/home/vvin/checkouts/pd-blitproof";
Bun.serve({
  port: Number(port),
  hostname: "127.0.0.1",
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response(Bun.file(`${root}/index.html`));
    if (path === "/bundle.js") return new Response(Bun.file(`${root}/out/harness.js`));
    if (path === "/styles.css") return new Response(Bun.file(`${checkout}/packages/core/styles.css`));
    if (path.startsWith("/pd/wasm/")) return new Response(Bun.file(`${checkout}/packages/wasm/pkg/${path.slice(9)}`));
    return new Response("not found", { status: 404 });
  },
});
