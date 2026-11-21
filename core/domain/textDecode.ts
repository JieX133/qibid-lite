// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.
/**
 * 纯函数文本字节解码器（UTF-8 / UTF-16LE / UTF-16BE / GB18030 自动嗅探）。
 * 独立于 projectVault.ts，供 docExtract 与开源核心包 qibid-core 零耦合复用。
 */

function cjkCount(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x4e00 && code <= 0x9fff) n += 1;
  }
  return n;
}

function looksAsciiUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const n = Math.min(bytes.length, 64);
  if (n < 4 || n % 2 !== 0) return null;
  const pairs = Math.floor(n / 2);
  let oddZero = 0;
  let evenZero = 0;
  for (let i = 0; i < pairs; i += 1) {
    if (bytes[i * 2] === 0) evenZero += 1;
    if (bytes[i * 2 + 1] === 0) oddZero += 1;
  }
  if (oddZero >= pairs * 0.6) return "utf-16le";
  if (evenZero >= pairs * 0.6) return "utf-16be";
  return null;
}

export function looksUtf16Text(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return true;
  if (looksAsciiUtf16(bytes) !== null) return true;
  if (bytes.length >= 4 && bytes.length % 2 === 0) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 256));
    return cjkCount(new TextDecoder("utf-16le").decode(sample)) >= 2
      || cjkCount(new TextDecoder("utf-16be").decode(sample)) >= 2;
  }
  return false;
}

function preferUtf16IfMoreCjk(bytes: Uint8Array, current: string): string {
  if (bytes.length < 4 || bytes.length % 2 !== 0) return current;
  const head = current.trimStart();
  // 合法 UTF-8（无替换符）里已经有中文，或是 JSON / HTML，不再按「UTF-16 里汉字更多」改判。
  if (!current.includes("\uFFFD") && (head.startsWith("{") || head.startsWith("[") || head.startsWith("<") || cjkCount(current) >= 2)) return current;
  const le = new TextDecoder("utf-16le").decode(bytes);
  const be = new TextDecoder("utf-16be").decode(bytes);
  const cur = cjkCount(current);
  const leN = cjkCount(le);
  const beN = cjkCount(be);
  if (leN >= 2 && leN > cur && leN >= beN) return le;
  if (beN >= 2 && beN > cur) return be;
  return current;
}

export function decodeTextBytes(bytes: Uint8Array, opts?: { recodeGbk?: boolean }): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const asciiUtf16 = looksAsciiUtf16(bytes);
  if (asciiUtf16 !== null) return new TextDecoder(asciiUtf16).decode(bytes);
  const buf = Buffer.from(bytes);
  const utf8 = buf.toString("utf8");
  if (opts?.recodeGbk === false) return utf8;
  const utf8Bad = (utf8.match(/\uFFFD/g) ?? []).length;
  let chosen = utf8;
  if (utf8Bad >= 3) {
    try {
      const gb = new TextDecoder("gb18030").decode(bytes);
      const gbBad = (gb.match(/\uFFFD/g) ?? []).length;
      if (gbBad < utf8Bad) chosen = gb;
    } catch {
      chosen = utf8;
    }
  }
  return preferUtf16IfMoreCjk(bytes, chosen);
}
