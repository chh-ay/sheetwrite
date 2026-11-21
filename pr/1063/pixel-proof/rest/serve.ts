// serve.ts <port>: the rest-render page, its three bundles, the core stylesheet and the engine file.
const [port] = process.argv.slice(2);
const root = "/home/vvin/learn/perfdeep/rest";
const checkout = "/home/vvin/checkouts/pd-blitproof";
Bun.serve({
  port: Number(port),
  hostname: "127.0.0.1",
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response(Bun.file(`${root}/index.html`));
    if (path === "/dev.js") return new Response(Bun.file(`${root}/out/entry-dev.js`));
    if (path === "/pr.js") return new Response(Bun.file(`${root}/out/entry-pr.js`));
    if (path === "/page.js") return new Response(Bun.file(`${root}/out/page.js`));
    if (path === "/styles.css") return new Response(Bun.file(`${checkout}/packages/core/styles.css`));
    if (path.startsWith("/dev/wasm/")) return new Response(Bun.file(`/home/vvin/checkouts/pd-dev/packages/wasm/pkg/${path.slice(10)}`));
    if (path.startsWith("/pd/wasm/")) return new Response(Bun.file(`${checkout}/packages/wasm/pkg/${path.slice(9)}`));
    return new Response("not found", { status: 404 });
  },
});
