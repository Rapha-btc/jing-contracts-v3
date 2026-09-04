// _api-proxy.mjs - local stand-in for api.hiro.so while its free tier rate-limits
// clarinet remote_data. Routes /extended/* to the signer box API and the node
// RPC routes (/v2, /v3) to the box node. Run: node simulations/_api-proxy.mjs
// then set [repl.remote_data] api_url = "http://127.0.0.1:8787" for the run.
// routes /extended/* to the box API, everything else (/v2, /v3 node RPC) to the node
import http from "node:http";
const API = { host: "77.42.3.101", port: 80, prefix: "/stacks-api" };
const NODE = { host: "77.42.3.101", port: 20443, prefix: "" };
http.createServer((req, res) => {
  const t = req.url.startsWith("/extended") ? API : NODE;
  const p = http.request({ host: t.host, port: t.port, path: t.prefix + req.url, method: req.method, headers: { ...req.headers, host: t.host } }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
}).listen(8787, "127.0.0.1", () => console.log("proxy on 8787"));
