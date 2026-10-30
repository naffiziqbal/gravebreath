// three.js expects a few browser globals that React Native does not provide.

const g = globalThis as Record<string, unknown>;

if (typeof g.TextDecoder === 'undefined') {
  // UTF-8 only; GLTFLoader uses it to read the .glb JSON chunk
  class Utf8Decoder {
    decode(input?: ArrayBufferView | ArrayBuffer): string {
      if (!input) return '';
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '';
      for (let i = 0; i < bytes.length; ) {
        const b = bytes[i++];
        let cp = b;
        if (b >= 0xf0) cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        else if (b >= 0xe0) cp = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        else if (b >= 0xc0) cp = ((b & 31) << 6) | (bytes[i++] & 63);
        out += String.fromCodePoint(cp);
      }
      return out;
    }
  }
  g.TextDecoder = Utf8Decoder;
}

const nav = g.navigator as { userAgent?: string } | undefined;
if (nav && typeof nav.userAgent !== 'string') {
  try {
    nav.userAgent = 'ReactNative';
  } catch {
    // read-only navigator on some runtimes; three only feature-sniffs it
  }
}
