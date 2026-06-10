// evm.mjs — minimal zero-dependency EVM toolkit for Pharos
// RLP encoding, EIP-1559 transaction signing, EIP-191 personal_sign,
// ABI encoding/decoding (subset), keccak256, address utilities.
// Uses vendored @noble/secp256k1 + @noble/hashes (audited primitives).
import * as secp from './vendor/secp256k1.mjs';
import { keccak_256 } from './vendor/sha3.mjs';
import { hmac } from './vendor/hmac.mjs';
import { sha256 } from './vendor/sha256.mjs';

secp.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));

// ---------- bytes/hex utils ----------
export const strip0x = (h) => (h.startsWith('0x') ? h.slice(2) : h);
export const hexToBytes = (h) => {
  h = strip0x(h);
  if (h.length % 2) h = '0' + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};
export const bytesToHex = (b) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const concat = (...arrs) => {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
export const utf8 = (s) => new TextEncoder().encode(s);
export const keccak = (data) => keccak_256(typeof data === 'string' ? utf8(data) : data);

export const bigintToBytes = (n) => {
  if (n === 0n) return new Uint8Array([]);
  let h = n.toString(16);
  if (h.length % 2) h = '0' + h;
  return hexToBytes(h);
};
export const bytesToBigint = (b) => (b.length === 0 ? 0n : BigInt(bytesToHex(b)));

// ---------- RLP ----------
export function rlpEncode(item) {
  if (Array.isArray(item)) {
    const payload = concat(...item.map(rlpEncode));
    return concat(encodeLength(payload.length, 0xc0), payload);
  }
  const b = item instanceof Uint8Array ? item : hexToBytes(item);
  if (b.length === 1 && b[0] < 0x80) return b;
  return concat(encodeLength(b.length, 0x80), b);
}
function encodeLength(len, offset) {
  if (len < 56) return new Uint8Array([len + offset]);
  const lenBytes = bigintToBytes(BigInt(len));
  return concat(new Uint8Array([lenBytes.length + offset + 55]), lenBytes);
}

// ---------- address ----------
export function privToAddress(privHex) {
  const pub = secp.getPublicKey(hexToBytes(privHex), false);
  return checksum(bytesToHex(keccak(pub.slice(1)).slice(-20)));
}
export function checksum(addr) {
  const a = strip0x(addr).toLowerCase();
  const h = bytesToHex(keccak(a)).slice(2);
  let out = '0x';
  for (let i = 0; i < a.length; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}
export const randomPriv = () => bytesToHex(secp.utils.randomPrivateKey());

// ---------- signing ----------
export function signHash(msgHash, privHex) {
  const sig = secp.sign(msgHash, hexToBytes(privHex));
  return { r: sig.r, s: sig.s, v: sig.recovery };
}
// EIP-191 personal_sign
export function personalSign(message, privHex) {
  const msgBytes = typeof message === 'string' ? utf8(message) : message;
  const prefixed = concat(utf8(`\x19Ethereum Signed Message:\n${msgBytes.length}`), msgBytes);
  const { r, s, v } = signHash(keccak(prefixed), privHex);
  return bytesToHex(concat(
    hexToBytes(r.toString(16).padStart(64, '0')),
    hexToBytes(s.toString(16).padStart(64, '0')),
    new Uint8Array([v + 27])
  ));
}

// EIP-1559 (type 2) transaction
export function signTx(tx, privHex) {
  // tx: {chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data}
  const fields = [
    bigintToBytes(BigInt(tx.chainId)),
    bigintToBytes(BigInt(tx.nonce)),
    bigintToBytes(BigInt(tx.maxPriorityFeePerGas)),
    bigintToBytes(BigInt(tx.maxFeePerGas)),
    bigintToBytes(BigInt(tx.gasLimit)),
    tx.to ? hexToBytes(tx.to) : new Uint8Array([]),
    bigintToBytes(BigInt(tx.value ?? 0)),
    tx.data ? hexToBytes(tx.data) : new Uint8Array([]),
    [], // accessList
  ];
  const unsigned = concat(new Uint8Array([2]), rlpEncode(fields));
  const { r, s, v } = signHash(keccak(unsigned), privHex);
  const signed = concat(new Uint8Array([2]), rlpEncode([
    ...fields,
    bigintToBytes(BigInt(v)),
    bigintToBytes(r),
    bigintToBytes(s),
  ]));
  return { raw: bytesToHex(signed), hash: bytesToHex(keccak(signed)) };
}

// ---------- ABI encoding (subset: uint256, int256, address, bool, bytes32, bytes, string, address[], uint256[], bytes32[], string[]) ----------
const pad32 = (b) => { const out = new Uint8Array(32); out.set(b, 32 - b.length); return out; };
const padRight = (b) => { const out = new Uint8Array(Math.ceil(b.length / 32) * 32 || 32); out.set(b, 0); return out; };

function encWord(type, value) {
  if (type === 'address') return pad32(hexToBytes(value));
  if (type === 'bool') return pad32(new Uint8Array([value ? 1 : 0]));
  if (type === 'bytes32') return pad32(hexToBytes(value));
  if (type.startsWith('uint') || type.startsWith('int')) {
    let n = BigInt(value);
    if (n < 0n) n = (1n << 256n) + n; // two's complement
    return pad32(bigintToBytes(n));
  }
  throw new Error('unsupported static type ' + type);
}
const isDynamic = (t) => t === 'bytes' || t === 'string' || t.endsWith('[]');

export function abiEncode(types, values) {
  const head = [];
  const tail = [];
  const headSize = types.length * 32;
  let tailOffset = 0;
  for (let i = 0; i < types.length; i++) {
    const t = types[i], v = values[i];
    if (!isDynamic(t)) { head.push(encWord(t, v)); continue; }
    head.push(encWord('uint256', headSize + tailOffset));
    let enc;
    if (t === 'bytes' || t === 'string') {
      const b = t === 'string' ? utf8(v) : hexToBytes(v);
      enc = concat(encWord('uint256', b.length), b.length ? padRight(b) : new Uint8Array(0));
    } else {
      const base = t.slice(0, -2);
      if (isDynamic(base)) {
        // dynamic-element array (e.g. string[])
        const elems = v.map((x) => {
          const b = base === 'string' ? utf8(x) : hexToBytes(x);
          return concat(encWord('uint256', b.length), b.length ? padRight(b) : new Uint8Array(0));
        });
        const offsets = [];
        let off = v.length * 32;
        for (const e of elems) { offsets.push(encWord('uint256', off)); off += e.length; }
        enc = concat(encWord('uint256', v.length), ...offsets, ...elems);
      } else {
        enc = concat(encWord('uint256', v.length), ...v.map((x) => encWord(base, x)));
      }
    }
    tail.push(enc);
    tailOffset += enc.length;
  }
  return concat(...head, ...tail);
}

export function selector(sig) { return keccak(sig).slice(0, 4); }

export function encodeCall(signature, values = []) {
  // signature like "transfer(address,uint256)"
  const types = signature.slice(signature.indexOf('(') + 1, -1).split(',').filter(Boolean);
  return bytesToHex(concat(selector(signature), abiEncode(types, values)));
}

// ---------- ABI decoding (subset) ----------
export function abiDecode(types, dataHex) {
  const data = hexToBytes(dataHex);
  const word = (i) => data.slice(i, i + 32);
  const results = [];
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const w = word(i * 32);
    if (!isDynamic(t)) { results.push(decWord(t, w)); continue; }
    const off = Number(bytesToBigint(w));
    if (t === 'bytes' || t === 'string') {
      const len = Number(bytesToBigint(word(off)));
      const b = data.slice(off + 32, off + 32 + len);
      results.push(t === 'string' ? new TextDecoder().decode(b) : bytesToHex(b));
    } else {
      const base = t.slice(0, -2);
      const len = Number(bytesToBigint(word(off)));
      const arr = [];
      for (let j = 0; j < len; j++) {
        if (isDynamic(base)) {
          const eOff = off + 32 + Number(bytesToBigint(word(off + 32 + j * 32)));
          const eLen = Number(bytesToBigint(word(eOff)));
          const b = data.slice(eOff + 32, eOff + 32 + eLen);
          arr.push(base === 'string' ? new TextDecoder().decode(b) : bytesToHex(b));
        } else {
          arr.push(decWord(base, word(off + 32 + j * 32)));
        }
      }
      results.push(arr);
    }
  }
  return results;
}
/// Decode a function return that is a SINGLE struct containing dynamic fields
/// (string/bytes/array). Solidity encodes such returns as offset(0x20) + tuple
/// content; inner offsets are relative to the tuple start — so we strip the
/// leading word and decode normally.
export function abiDecodeStruct(types, dataHex) {
  return abiDecode(types, '0x' + strip0x(dataHex).slice(64));
}

function decWord(type, w) {
  if (type === 'address') return checksum(bytesToHex(w.slice(12)));
  if (type === 'bool') return w[31] === 1;
  if (type === 'bytes32') return bytesToHex(w);
  if (type.startsWith('uint')) return bytesToBigint(w);
  if (type.startsWith('int')) {
    let n = bytesToBigint(w);
    if (n >= 1n << 255n) n -= 1n << 256n;
    return n;
  }
  throw new Error('unsupported decode type ' + type);
}

// ---------- EIP-712 typed data ----------
function typeHashOf(primaryType, types) {
  const deps = new Set();
  const collect = (t) => {
    if (!types[t] || deps.has(t)) return;
    deps.add(t);
    for (const f of types[t]) {
      const base = f.type.replace(/\[\]$/, '');
      collect(base);
    }
  };
  collect(primaryType);
  deps.delete(primaryType);
  const ordered = [primaryType, ...[...deps].sort()];
  return ordered.map((t) => `${t}(${types[t].map((f) => `${f.type} ${f.name}`).join(',')})`).join('');
}

function encodeField(type, value, types) {
  if (types[type]) return keccak(structEncode(type, value, types));
  if (type === 'string') return keccak(utf8(value));
  if (type === 'bytes') return keccak(hexToBytes(value));
  if (type.endsWith(']')) {
    const base = type.slice(0, type.indexOf('['));
    return keccak(concat(...value.map((v) => encodeField(base, v, types))));
  }
  return encWord(type, value);
}

function structEncode(primaryType, data, types) {
  const parts = [keccak(typeHashOf(primaryType, types))];
  for (const f of types[primaryType]) parts.push(encodeField(f.type, data[f.name], types));
  return concat(...parts);
}

export function typedDataHash({ domain, types, primaryType, message }) {
  const domainFields = [];
  if (domain.name !== undefined) domainFields.push({ name: 'name', type: 'string' });
  if (domain.version !== undefined) domainFields.push({ name: 'version', type: 'string' });
  if (domain.chainId !== undefined) domainFields.push({ name: 'chainId', type: 'uint256' });
  if (domain.verifyingContract !== undefined) domainFields.push({ name: 'verifyingContract', type: 'address' });
  if (domain.salt !== undefined) domainFields.push({ name: 'salt', type: 'bytes32' });
  const allTypes = { EIP712Domain: domainFields, ...types };
  const domainSep = keccak(structEncode('EIP712Domain', domain, allTypes));
  const structHash = keccak(structEncode(primaryType, message, allTypes));
  return keccak(concat(new Uint8Array([0x19, 0x01]), domainSep, structHash));
}

export function signTypedData(typed, privHex) {
  const { r, s, v } = signHash(typedDataHash(typed), privHex);
  return {
    r: '0x' + r.toString(16).padStart(64, '0'),
    s: '0x' + s.toString(16).padStart(64, '0'),
    v: v + 27,
    signature: '0x' + r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0') + (v + 27).toString(16).padStart(2, '0'),
  };
}

// ---------- units ----------
export const parseUnits = (val, decimals = 18) => {
  const [i, f = ''] = String(val).split('.');
  return BigInt(i + f.padEnd(decimals, '0').slice(0, decimals));
};
export const formatUnits = (n, decimals = 18) => {
  n = BigInt(n);
  const neg = n < 0n; if (neg) n = -n;
  const s = n.toString().padStart(decimals + 1, '0');
  const i = s.slice(0, -decimals) || '0';
  const f = s.slice(-decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + (f ? `${i}.${f}` : i);
};

// ---------- JSON-RPC client ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class Rpc {
  constructor(url, { timeoutMs = 30000 } = {}) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.id = 1;
  }
  async call(method, params = []) {
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: this.id++, method, params }),
          signal: ctrl.signal,
        });
        const j = await res.json();
        if (j.error) {
          const e = new Error(`RPC ${method}: ${j.error.message}`); e.code = j.error.code; e.data = j.error.data;
          // rate-limit / transient → backoff and retry
          if (e.code === -32011 || /too fast|rate|limit exceeded/i.test(j.error.message ?? '')) { lastErr = e; await sleep(1500 * (attempt + 1)); continue; }
          throw e;
        }
        return j.result;
      } catch (e) {
        if (e?.name === 'AbortError' || /fetch failed|network|ECONN/i.test(String(e?.message))) { lastErr = e; await sleep(1000 * (attempt + 1)); continue; }
        throw e;
      } finally { clearTimeout(t); }
    }
    throw lastErr ?? new Error(`RPC ${method}: retries exhausted`);
  }
  chainId() { return this.call('eth_chainId').then((r) => Number(r)); }
  blockNumber() { return this.call('eth_blockNumber').then((r) => Number(r)); }
  getBalance(addr) { return this.call('eth_getBalance', [addr, 'latest']).then(BigInt); }
  getNonce(addr, tag = 'pending') { return this.call('eth_getTransactionCount', [addr, tag]).then((r) => Number(r)); }
  gasPrice() { return this.call('eth_gasPrice').then(BigInt); }
  estimateGas(tx) { return this.call('eth_estimateGas', [tx]).then(BigInt); }
  sendRaw(raw) { return this.call('eth_sendRawTransaction', [raw]); }
  receipt(hash) { return this.call('eth_getTransactionReceipt', [hash]); }
  ethCall(to, data) { return this.call('eth_call', [{ to, data }, 'latest']); }
  getLogs(filter) { return this.call('eth_getLogs', [filter]); }
  async waitReceipt(hash, { tries = 40, delayMs = 3500 } = {}) {
    for (let i = 0; i < tries; i++) {
      await new Promise((res) => setTimeout(res, delayMs + Math.floor(Math.random() * 500)));
      try {
        const r = await this.receipt(hash);
        if (r) return r;
      } catch (e) {
        // rate-limit blips shouldn't kill a confirmed-but-unfetched tx
        if (!/limit|too fast/i.test(String(e?.message))) throw e;
      }
    }
    throw new Error('timeout waiting for receipt ' + hash);
  }
  /// getLogs with automatic chunking to satisfy RPC block-range caps (~1000 blocks).
  async getLogsChunked(filter, { chunkSize = 950, maxChunks = 12 } = {}) {
    const latest = await this.blockNumber();
    let from = typeof filter.fromBlock === 'string' ? Number(filter.fromBlock) : (filter.fromBlock ?? latest - 950);
    let to = filter.toBlock === undefined || filter.toBlock === 'latest' ? latest : (typeof filter.toBlock === 'string' ? Number(filter.toBlock) : filter.toBlock);
    if (to - from > chunkSize * maxChunks) from = to - chunkSize * maxChunks; // cap lookback
    const out = [];
    for (let start = from; start <= to; start += chunkSize + 1) {
      const end = Math.min(start + chunkSize, to);
      const logs = await this.call('eth_getLogs', [{ ...filter, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16) }]);
      out.push(...logs);
      if (start + chunkSize + 1 <= to) await new Promise((r) => setTimeout(r, 400));
    }
    return out;
  }
}

// ---------- high-level wallet ----------
export class Wallet {
  constructor(privHex, rpc) {
    this.priv = strip0x(privHex);
    this.address = privToAddress(this.priv);
    this.rpc = rpc;
  }
  /// Pharos gas notes: the chain charges gas_limit (not gas_used) at inclusion,
  /// and blocks land with 0 priority fee. So we keep the estimate buffer modest
  /// and default the tip to 0 to make every demo tx as cheap as possible.
  async sendTx({ to, value = 0n, data = '0x', gasLimit, gasBufferPct = 15, maxFeePerGas, maxPriorityFeePerGas = 0n }) {
    const [nonce, chainId, feeHist] = await Promise.all([
      this.rpc.getNonce(this.address),
      this.rpc.chainId(),
      this.rpc.call('eth_feeHistory', ['0x1', 'latest', []]),
    ]);
    const baseFee = BigInt(feeHist?.baseFeePerGas?.at(-1) ?? '0x3b9aca00'); // fallback 1 gwei
    if (!gasLimit) {
      const est = await this.rpc.estimateGas({ from: this.address, to: to ?? undefined, value: '0x' + BigInt(value).toString(16), data });
      gasLimit = est + (est * BigInt(gasBufferPct)) / 100n;
    }
    const tx = {
      chainId, nonce,
      maxPriorityFeePerGas,
      maxFeePerGas: maxFeePerGas ?? (baseFee * 2n + maxPriorityFeePerGas),
      gasLimit, to, value, data,
    };
    const { raw, hash } = signTx(tx, this.priv);
    const sent = await this.rpc.sendRaw(raw);
    return { hash: sent ?? hash };
  }
}
