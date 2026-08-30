// Minimal browser shim for the single `import { Buffer } from "/node/buffer.mjs"`
// that the esm.sh bundle of @supabase/supabase-js emits. supabase-js only touches
// Buffer on a base64 decode path that also has an atob() fallback in browsers, so a
// thin implementation is enough and keeps the vendored bundle fully offline.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export const Buffer = {
  from(input, enc) {
    if (input instanceof Uint8Array) return input;
    const str = String(input);
    if (enc === "base64") {
      const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return _wrap(out);
    }
    return _wrap(new TextEncoder().encode(str));
  },
  isBuffer(x) { return x instanceof Uint8Array; },
  alloc(n) { return _wrap(new Uint8Array(n)); },
};
function _wrap(u8) {
  u8.toString = (enc) => {
    if (enc === "base64") {
      let s = "";
      for (let i = 0; i < u8.length; i += 3) {
        const b = (u8[i] << 16) | ((u8[i + 1] || 0) << 8) | (u8[i + 2] || 0);
        s += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] +
             (i + 1 < u8.length ? B64[(b >> 6) & 63] : "=") +
             (i + 2 < u8.length ? B64[b & 63] : "=");
      }
      return s;
    }
    return new TextDecoder().decode(u8);
  };
  return u8;
}
export default { Buffer };
