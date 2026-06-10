#!/usr/bin/env node
// pharos-agent-registry — MCP server
// On-chain identity, capability declaration, and peer attestation for AI agents
// on Pharos. Wraps the AgentRegistry contract: agents register unique names,
// declare what they can do, and earn endorsements from peers — the social/
// discovery layer of the agent economy.
//
// Tools:
//   register_agent      — claim a unique agent name + profile
//   update_profile      — change metadata/endpoint/active flag
//   declare_capability  — declare a skill tag (e.g. "swap-execution")
//   attest_capability   — endorse another agent's capability
//   lookup_agent        — resolve by name or address; full profile + endorsements
//   check_reputation    — endorsement counts for an agent's capabilities
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, abiDecodeStruct, keccak, bytesToHex, utf8, checksum } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, getNetwork, addrLink } from './lib/pharos.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const VERSION = '1.0.0';
const __dir = dirname(fileURLToPath(import.meta.url));
const ZERO = '0x0000000000000000000000000000000000000000';

function registryAddress(network) {
  if (process.env.PHAROS_REGISTRY_ADDRESS) return process.env.PHAROS_REGISTRY_ADDRESS;
  try {
    const dep = JSON.parse(readFileSync(join(__dir, '..', 'assets', 'deployments.json'), 'utf8'));
    const net = getNetwork(network).name;
    if (dep[net]?.AgentRegistry) return dep[net].AgentRegistry;
  } catch {}
  throw new Error('AgentRegistry address unknown: set PHAROS_REGISTRY_ADDRESS or assets/deployments.json');
}

async function sendAndReport(wallet, to, data, network) {
  const { hash } = await wallet.sendTx({ to, data });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  return { ok: rcpt.status === '0x1', txHash: hash, gasUsed: Number(rcpt.gasUsed), explorer: txLink(hash, network), receipt: rcpt };
}

async function readProfile(rpc, addr, owner) {
  const raw = await rpc.ethCall(addr, encodeCall('getProfile(address)', [owner]));
  const [o, name, metadataURI, endpoint, registeredAt, updatedAt, active] =
    abiDecodeStruct(['address', 'string', 'string', 'string', 'uint40', 'uint40', 'bool'], raw);
  if (Number(registeredAt) === 0) return null;
  return {
    owner: o, name, metadataURI, endpoint,
    registeredAt: new Date(Number(registeredAt) * 1000).toISOString(),
    updatedAt: new Date(Number(updatedAt) * 1000).toISOString(),
    active,
  };
}

const server = new McpServer({
  name: 'pharos-agent-registry',
  version: VERSION,
  instructions: 'On-chain agent identity on Pharos: register names, declare capabilities, attest peers, look up agents before transacting. Write ops need PHAROS_PRIVATE_KEY.',
});

// ---------------------------------------------------------------- register_agent
server.tool(
  'register_agent',
  'Register the caller (PHAROS_PRIVATE_KEY address) as an agent with a globally unique name. metadataURI: off-chain profile JSON (https/ipfs). endpoint: how to reach the agent (e.g. "mcp+stdio://...", "https://api.agent.example/v1").',
  {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 64 },
      metadataURI: { type: 'string', description: 'optional' },
      endpoint: { type: 'string', description: 'optional' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['name'],
  },
  async ({ name, metadataURI = '', endpoint = '', network }) => {
    const wallet = walletFor(network);
    const addr = registryAddress(network);
    const res = await sendAndReport(wallet, addr, encodeCall('register(string,string,string)', [name, metadataURI, endpoint]), network);
    return res.ok
      ? { ok: true, name, owner: wallet.address, contract: addr, txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'register reverted (name taken? already registered?)', ...res };
  }
);

// ---------------------------------------------------------------- update_profile
server.tool(
  'update_profile',
  'Update your agent profile fields (metadataURI, endpoint, active status).',
  {
    type: 'object',
    properties: {
      metadataURI: { type: 'string' },
      endpoint: { type: 'string' },
      active: { type: 'boolean', description: 'default true' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
  },
  async ({ metadataURI = '', endpoint = '', active = true, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, registryAddress(network), encodeCall('update(string,string,bool)', [metadataURI, endpoint, active]), network);
    return res.ok ? { ok: true, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'update reverted (not registered?)', ...res };
  }
);

// ---------------------------------------------------------------- declare_capability
server.tool(
  'declare_capability',
  'Declare a capability your agent performs, e.g. "swap-execution", "solidity-audit", "data-feeds". Free-form label; stored as keccak hash with the label in the event log.',
  {
    type: 'object',
    properties: {
      label: { type: 'string', minLength: 1, maxLength: 128 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['label'],
  },
  async ({ label, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, registryAddress(network), encodeCall('declareCapability(string)', [label]), network);
    return res.ok
      ? { ok: true, label, capabilityHash: bytesToHex(keccak(utf8(label))), txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'declare reverted (not registered?)', ...res };
  }
);

// ---------------------------------------------------------------- attest_capability
server.tool(
  'attest_capability',
  'Endorse another agent: attest that `subject` competently performs `label`. One attestation per attester per capability. Builds the web-of-trust other agents query before hiring.',
  {
    type: 'object',
    properties: {
      subject: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      label: { type: 'string', minLength: 1, maxLength: 128 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['subject', 'label'],
  },
  async ({ subject, label, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, registryAddress(network), encodeCall('attest(address,string)', [subject, label]), network);
    return res.ok
      ? { ok: true, subject: checksum(subject), label, attester: wallet.address, txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'attest reverted (self-attestation? subject not registered? capability not declared?)', ...res };
  }
);

// ---------------------------------------------------------------- lookup_agent
server.tool(
  'lookup_agent',
  'Look up an agent by unique name OR wallet address. Returns profile, declared capabilities (hashes), and explorer link. The pre-transaction due-diligence primitive.',
  {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'agent name to resolve' },
      address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'or owner address' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
  },
  async ({ name, address, network }) => {
    const rpc = rpcFor(network);
    const addr = registryAddress(network);
    let owner = address;
    if (!owner) {
      if (!name) return { ok: false, error: 'pass name or address' };
      const raw = await rpc.ethCall(addr, encodeCall('resolveName(string)', [name]));
      owner = abiDecode(['address'], raw)[0];
      if (owner === ZERO) return { ok: false, error: `no agent named "${name}"` };
    }
    const profile = await readProfile(rpc, addr, owner);
    if (!profile) return { ok: false, error: 'address is not a registered agent' };
    const capsRaw = await rpc.ethCall(addr, encodeCall('capabilitiesOf(address)', [owner]));
    const caps = abiDecode(['bytes32[]'], capsRaw)[0];
    return { ok: true, ...profile, capabilities: caps, capabilityCount: caps.length, explorer: addrLink(owner, network), contract: addr };
  }
);

// ---------------------------------------------------------------- check_reputation
server.tool(
  'check_reputation',
  'Get endorsement counts for an agent across given capability labels. Use before delegating work to an unknown agent.',
  {
    type: 'object',
    properties: {
      subject: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      labels: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['subject', 'labels'],
  },
  async ({ subject, labels, network }) => {
    const rpc = rpcFor(network);
    const addr = registryAddress(network);
    const results = [];
    for (const label of labels) {
      const raw = await rpc.ethCall(addr, encodeCall('endorsements(address,string)', [subject, label]));
      results.push({ label, endorsements: Number(abiDecode(['uint256'], raw)[0]) });
    }
    return { ok: true, subject: checksum(subject), reputation: results, total: results.reduce((a, r) => a + r.endorsements, 0) };
  }
);

server.start();
