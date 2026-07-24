#!/usr/bin/env node
/**
 * Raw TCP WebSocket proxy for MDVR VOD media ports.
 *
 * Browser:
 *   ws://<cmp-host>:3104/p/6604/3/5?DownType=5&...
 *   ws://<cmp-host>:3104/p/6611/3/5?DownType=5&...
 *
 * Env:
 *   MDVR_VOD_PROXY_PORT  default 3104
 *   MDVR_VOD_PROXY_HOST  default 14.21.18.177
 */
import net from "net";

const listenPort = Number(process.env.MDVR_VOD_PROXY_PORT || 3104);
const mediaHost = (process.env.MDVR_VOD_PROXY_HOST || "14.21.18.177").trim();
const ALLOWED_PORTS = new Set([6604, 6611, 6605]);

function rewriteUpgrade(rawBuf) {
  const raw = rawBuf.toString("binary");
  const idx = raw.indexOf("\r\n\r\n");
  if (idx < 0) return null;
  const header = raw.slice(0, idx);
  const body = raw.slice(idx + 4);
  const lines = header.split("\r\n");
  const reqLine = lines[0] || "";
  const m = reqLine.match(/^GET\s+\/p\/(\d+)(\/\S*)\s+HTTP\/\d\.\d$/i);
  if (!m) return { error: "bad path (expected /p/<port>/...)" };
  const targetPort = Number(m[1]);
  if (!ALLOWED_PORTS.has(targetPort)) return { error: "port not allowed" };
  const targetFullPath = m[2] || "/";

  const out = [`GET ${targetFullPath} HTTP/1.1`];
  let sawHost = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^host:/i.test(line)) {
      out.push(`Host: ${mediaHost}:${targetPort}`);
      sawHost = true;
    } else {
      out.push(line);
    }
  }
  if (!sawHost) out.push(`Host: ${mediaHost}:${targetPort}`);
  const rewritten = Buffer.from(out.join("\r\n") + "\r\n\r\n" + body, "binary");
  return { targetPort, rewritten };
}

const server = net.createServer((client) => {
  let buf = Buffer.alloc(0);
  let upstream = null;
  let pending = [];
  let ready = false;

  const fail = (msg) => {
    try {
      client.write(`HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n${msg || ""}`);
    } catch {
      /* ignore */
    }
    client.destroy();
    if (upstream) upstream.destroy();
  };

  client.on("data", (chunk) => {
    if (ready && upstream) {
      upstream.write(chunk);
      return;
    }
    if (upstream && !ready) {
      pending.push(chunk);
      return;
    }

    buf = Buffer.concat([buf, chunk]);
    if (buf.indexOf("\r\n\r\n") < 0) {
      if (buf.length > 65536) fail("header too large");
      return;
    }

    const parsed = rewriteUpgrade(buf);
    buf = Buffer.alloc(0);
    if (!parsed || parsed.error) {
      fail(parsed?.error || "parse error");
      return;
    }

    upstream = net.connect({ host: mediaHost, port: parsed.targetPort }, () => {
      upstream.write(parsed.rewritten);
      for (const p of pending) upstream.write(p);
      pending = [];
      ready = true;
    });

    upstream.on("data", (d) => {
      try {
        client.write(d);
      } catch {
        upstream.destroy();
      }
    });
    upstream.on("error", () => fail("upstream error"));
    upstream.on("close", () => client.destroy());
  });

  client.on("error", () => {
    if (upstream) upstream.destroy();
  });
  client.on("close", () => {
    if (upstream) upstream.destroy();
  });
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`[mdvr-vod-proxy] 0.0.0.0:${listenPort} -> ${mediaHost}:<6604|6611>`);
});
