// pharos.mjs — Pharos network helpers shared by all PharosKit skills.
// Network config, token registry, explorer links, env handling.
import { Rpc, Wallet, checksum } from './evm.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

export function loadNetworks() {
  // assets/networks.json sits next to the skill root (template-compatible)
  const p = join(__dir, '..', '..', 'assets', 'networks.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

export const NETWORKS = {
  'atlantic-testnet': {
    name: 'atlantic-testnet',
    rpcUrl: 'https://atlantic.dplabs-internal.com',
    chainId: 688689,
    explorerUrl: 'https://atlantic.pharosscan.xyz/',
    nativeToken: 'PHRS',
  },
  mainnet: {
    name: 'mainnet',
    rpcUrl: 'https://rpc.pharos.xyz',
    chainId: 1672,
    explorerUrl: 'https://www.pharosscan.xyz/',
    nativeToken: 'PROS',
  },
};

export const TOKENS = {
  'atlantic-testnet': {
    WPHRS: { address: '0x838800b758277CC111B2d48Ab01e5E164f8E9471', decimals: 18, symbol: 'WPHRS' },
    USDC: { address: '0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B', decimals: 6, symbol: 'USDC' },
    USDT: { address: '0xE7E84B8B4f39C507499c40B4ac199B050e2882d5', decimals: 6, symbol: 'USDT' },
    WBTC: { address: '0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4', decimals: 18, symbol: 'WBTC' },
    WETH: { address: '0x7d211F77525ea39A0592794f793cC1036eEaccD5', decimals: 18, symbol: 'WETH' },
  },
  mainnet: {
    WPROS: { address: '0x52c48d4213107b20bc583832b0d951fb9ca8f0b0', decimals: 18, symbol: 'WPROS' },
    USDC: { address: '0xc879c018db60520f4355c26ed1a6d572cdac1815', decimals: 6, symbol: 'USDC' },
  },
};

export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

export function getNetwork(name) {
  const net = NETWORKS[name ?? process.env.PHAROS_NETWORK ?? 'atlantic-testnet'];
  if (!net) throw new Error(`unknown network: ${name}. Use atlantic-testnet or mainnet.`);
  return net;
}

export function rpcFor(name) {
  const net = getNetwork(name);
  return new Rpc(process.env.PHAROS_RPC_URL ?? net.rpcUrl);
}

export function walletFor(name) {
  const pk = process.env.PHAROS_PRIVATE_KEY;
  if (!pk) throw new Error('PHAROS_PRIVATE_KEY env var is required for write operations. Set it to a funded testnet key. It is never logged or transmitted anywhere except to sign transactions locally.');
  return new Wallet(pk, rpcFor(name));
}

export function txLink(hash, name) {
  return `${getNetwork(name).explorerUrl}tx/${hash}`;
}
export function addrLink(addr, name) {
  return `${getNetwork(name).explorerUrl}address/${addr}`;
}

export function resolveToken(symbolOrAddress, name) {
  const net = getNetwork(name);
  if (/^0x[0-9a-fA-F]{40}$/.test(symbolOrAddress)) return { address: checksum(symbolOrAddress), decimals: null, symbol: null };
  const t = TOKENS[net.name]?.[symbolOrAddress.toUpperCase()];
  if (!t) throw new Error(`unknown token symbol "${symbolOrAddress}" on ${net.name}. Pass a 0x address or one of: ${Object.keys(TOKENS[net.name] ?? {}).join(', ')}`);
  return t;
}
