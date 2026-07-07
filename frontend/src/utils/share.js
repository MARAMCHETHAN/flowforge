// Share a pipeline as a URL: the whole graph is compressed and encoded
// into the hash fragment (#p=...), so links never expire, never hit the
// server, and cost nothing to host. Format: a 1-char version prefix —
// "1" = gzip (CompressionStream) + base64url, "0" = plain base64url
// fallback for older browsers/test environments.

const stripNode = ({ id, type, position, data }) => {
  const { lastValue, ...rest } = data || {};
  return { id, type, position, data: rest };
};

const stripEdge = ({ id, source, target, sourceHandle, targetHandle, type, animated }) => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type,
  animated,
});

// UTF-8-safe base64url without TextEncoder (jsdom-friendly)
const toB64url = (str) =>
  btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (b64) =>
  decodeURIComponent(
    escape(atob(b64.replace(/-/g, "+").replace(/_/g, "/")))
  );

const bytesToB64url = (bytes) => {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlToBytes = (b64) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const canGzip = () =>
  typeof CompressionStream !== "undefined" &&
  typeof Response !== "undefined" &&
  typeof Blob !== "undefined";

const gzipText = async (text) => {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return bytesToB64url(new Uint8Array(buf));
};

const gunzipText = async (b64) => {
  const stream = new Blob([b64urlToBytes(b64)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
};

export const encodePipeline = async (nodes, edges) => {
  const json = JSON.stringify({
    nodes: nodes.map(stripNode),
    edges: edges.map(stripEdge),
  });
  if (canGzip()) return "1" + (await gzipText(json));
  return "0" + toB64url(json);
};

export const decodePipeline = async (encoded) => {
  const version = encoded[0];
  const body = encoded.slice(1);
  const json = version === "1" ? await gunzipText(body) : fromB64url(body);
  const data = JSON.parse(json);
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error("Not a pipeline payload");
  }
  return data;
};

export const shareUrl = (encoded) =>
  `${window.location.origin}${window.location.pathname}#p=${encoded}`;
