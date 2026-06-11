#!/usr/bin/env node
// clawkit-erc8004 — MCP server
// ERC-8004 "Trustless Agents" operations: identity NFTs, reputation feedback,
// and validation request/response — the standard the Turing Test Hackathon
// issues agent identities under. Registries deployed + verified on Mantle
// Sepolia (assets/deployments.json) — original dependency-free implementation
// (contracts/ERC8004.sol).
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, keccak, bytesToHex, utf8, checksum } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, getNetwork, addrLink } from './lib/pharos.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const NET_ENUM = ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'];

function reg(network, which) {
  const dep = JSON.parse(readFileSync(join(__dir, '..', 'assets', 'deployments.json'), 'utf8'));
  const net = getNetwork(network).name;
  const a = dep[net]?.[which];
  if (!a) throw new Error(`${which} not deployed on ${net}`);
  return a;
}
async function send(wallet, to, data, network) {
  const { hash } = await wallet.sendTx({ to, data });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  return { ok: rcpt.status === '0x1', txHash: hash, explorer: txLink(hash, network), receipt: rcpt };
}
const dataURI = (obj) => 'data:application/json;base64,' + Buffer.from(JSON.stringify(obj)).toString('base64');

const server = new McpServer({
  name: 'clawkit-erc8004',
  version: '1.0.0',
  instructions: 'ERC-8004 Trustless Agents: mint agent identity NFTs (with fully on-chain data:URI registration files), give/read reputation feedback, request and respond to validations. Write ops need PHAROS_PRIVATE_KEY.',
});

server.tool('register_identity',
  'Mint an ERC-8004 agent identity NFT. Builds the spec-compliant registration file (type registration-v1) and stores it as a fully on-chain data: URI. Returns agentId.',
  { type: 'object', properties: {
      name: { type: 'string', minLength: 1 }, description: { type: 'string' },
      mcpEndpoint: { type: 'string', description: 'e.g. repo URL or mcp endpoint' },
      network: { type: 'string', enum: NET_ENUM } }, required: ['name'] },
  async ({ name, description = '', mcpEndpoint = '', network }) => {
    const wallet = walletFor(network);
    const identity = reg(network, 'ERC8004IdentityRegistry');
    const file = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name, description,
      services: mcpEndpoint ? [{ name: 'MCP', endpoint: mcpEndpoint, version: '2025-03-26' }] : [],
      x402Support: true, active: true,
      registrations: [{ agentId: 0, agentRegistry: `eip155:${getNetwork(network).chainId}:${identity}` }],
      supportedTrust: ['reputation', 'validation'],
    };
    const res = await send(wallet, identity, encodeCall('register(string)', [dataURI(file)]), network);
    if (!res.ok) return { ok: false, error: 'register reverted', ...res };
    // agentId from ERC-721 Transfer (topic3)
    const t = res.receipt.logs.find((l) => l.topics?.[0] === bytesToHex(keccak(utf8('Transfer(address,address,uint256)'))));
    const agentId = t ? Number(BigInt(t.topics[3])) : null;
    return { ok: true, agentId, owner: wallet.address, identityRegistry: identity, agentRegistry: file.registrations[0].agentRegistry, txHash: res.txHash, explorer: res.explorer };
  });

server.tool('resolve_agent',
  'Read an ERC-8004 agent: owner, agentURI (decodes data: URIs), agentWallet.',
  { type: 'object', properties: { agentId: { type: 'integer', minimum: 1 }, network: { type: 'string', enum: NET_ENUM } }, required: ['agentId'] },
  async ({ agentId, network }) => {
    const rpc = rpcFor(network);
    const identity = reg(network, 'ERC8004IdentityRegistry');
    const owner = abiDecode(['address'], await rpc.ethCall(identity, encodeCall('ownerOf(uint256)', [agentId])))[0];
    const uri = abiDecode(['string'], await rpc.ethCall(identity, encodeCall('agentURI(uint256)', [agentId])))[0];
    const wal = abiDecode(['address'], await rpc.ethCall(identity, encodeCall('getAgentWallet(uint256)', [agentId])))[0];
    let fileJson = null;
    if (uri.startsWith('data:application/json;base64,')) {
      try { fileJson = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8')); } catch {}
    }
    return { ok: true, agentId, owner, agentWallet: wal, agentURI: uri.slice(0, 120) + (uri.length > 120 ? '…' : ''), registrationFile: fileJson, explorer: addrLink(identity, network) };
  });

server.tool('give_feedback',
  'Post ERC-8004 reputation feedback for an agent (must NOT be its owner/operator). value with valueDecimals, e.g. 97 with 0 decimals for a 97/100 rating; tag1 e.g. "starred".',
  { type: 'object', properties: {
      agentId: { type: 'integer', minimum: 1 }, value: { type: 'integer' },
      valueDecimals: { type: 'integer', minimum: 0, maximum: 18 },
      tag1: { type: 'string' }, tag2: { type: 'string' },
      feedbackJson: { type: 'object', description: 'optional off-chain payload → stored as data:URI + hash' },
      network: { type: 'string', enum: NET_ENUM } }, required: ['agentId', 'value'] },
  async ({ agentId, value, valueDecimals = 0, tag1 = 'starred', tag2 = '', feedbackJson, network }) => {
    const wallet = walletFor(network);
    const rep = reg(network, 'ERC8004ReputationRegistry');
    const uri = feedbackJson ? dataURI(feedbackJson) : '';
    const fh = feedbackJson ? bytesToHex(keccak(utf8(JSON.stringify(feedbackJson)))) : '0x' + '0'.repeat(64);
    const data = encodeCall('giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)',
      [agentId, value, valueDecimals, tag1, tag2, '', uri, fh]);
    const res = await send(wallet, rep, data, network);
    return res.ok ? { ok: true, agentId, value, tag1, txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'giveFeedback reverted (owner/operator self-feedback? unregistered agent?)', ...res };
  });

server.tool('reputation_summary',
  'Aggregated ERC-8004 reputation for an agent: count + average value (optional tag1 filter).',
  { type: 'object', properties: { agentId: { type: 'integer', minimum: 1 }, tag1: { type: 'string' }, network: { type: 'string', enum: NET_ENUM } }, required: ['agentId'] },
  async ({ agentId, tag1 = '', network }) => {
    const rpc = rpcFor(network);
    const rep = reg(network, 'ERC8004ReputationRegistry');
    const out = await rpc.ethCall(rep, encodeCall('getSummary(uint256,address[],string)', [agentId, [], tag1]));
    const [count, avg] = abiDecode(['uint64', 'int128'], out);
    return { ok: true, agentId, feedbackCount: Number(count), averageValue: avg.toString(), tag1: tag1 || '(all)' };
  });

server.tool('request_validation',
  'As the agent owner, request independent validation of a work product: payload is hashed (requestHash) and embedded as a data: URI for the validator.',
  { type: 'object', properties: {
      agentId: { type: 'integer', minimum: 1 },
      validatorAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      payload: { type: 'string', minLength: 1, description: 'the work product / evidence to validate' },
      network: { type: 'string', enum: NET_ENUM } }, required: ['agentId', 'validatorAddress', 'payload'] },
  async ({ agentId, validatorAddress, payload, network }) => {
    const wallet = walletFor(network);
    const val = reg(network, 'ERC8004ValidationRegistry');
    const requestHash = bytesToHex(keccak(utf8(payload)));
    const uri = 'data:text/plain;base64,' + Buffer.from(payload).toString('base64');
    const res = await send(wallet, val, encodeCall('validationRequest(address,uint256,string,bytes32)', [validatorAddress, agentId, uri, requestHash]), network);
    return res.ok ? { ok: true, agentId, requestHash, validatorAddress: checksum(validatorAddress), txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'validationRequest reverted (not agent owner? duplicate hash?)', ...res };
  });

server.tool('respond_validation',
  'As the designated validator, post a 0-100 validation response for a requestHash.',
  { type: 'object', properties: {
      requestHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      response: { type: 'integer', minimum: 0, maximum: 100 },
      tag: { type: 'string' }, evidence: { type: 'string', description: 'optional evidence → hashed' },
      network: { type: 'string', enum: NET_ENUM } }, required: ['requestHash', 'response'] },
  async ({ requestHash, response, tag = '', evidence = '', network }) => {
    const wallet = walletFor(network);
    const val = reg(network, 'ERC8004ValidationRegistry');
    const rh = evidence ? bytesToHex(keccak(utf8(evidence))) : '0x' + '0'.repeat(64);
    const res = await send(wallet, val, encodeCall('validationResponse(bytes32,uint8,string,bytes32,string)', [requestHash, response, '', rh, tag]), network);
    return res.ok ? { ok: true, requestHash, response, tag, txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'validationResponse reverted (not the designated validator?)', ...res };
  });

server.tool('validation_status',
  'Read the on-chain validation status for a requestHash, or the aggregate summary for an agent.',
  { type: 'object', properties: {
      requestHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      agentId: { type: 'integer', minimum: 1 },
      network: { type: 'string', enum: NET_ENUM } } },
  async ({ requestHash, agentId, network }) => {
    const rpc = rpcFor(network);
    const val = reg(network, 'ERC8004ValidationRegistry');
    if (requestHash) {
      const out = await rpc.ethCall(val, encodeCall('getValidationStatus(bytes32)', [requestHash]));
      const [validator, aid, response, responseHash, tag, lastUpdate] = abiDecode(['address', 'uint256', 'uint8', 'bytes32', 'string', 'uint256'], '0x' + out.slice(2));
      return { ok: true, requestHash, validator, agentId: Number(aid), response: Number(response), tag, lastUpdate: new Date(Number(lastUpdate) * 1000).toISOString() };
    }
    if (agentId) {
      const out = await rpc.ethCall(val, encodeCall('getSummary(uint256,address[],string)', [agentId, [], '']));
      const [count, avg] = abiDecode(['uint64', 'uint8'], out);
      return { ok: true, agentId, validationCount: Number(count), averageResponse: Number(avg) };
    }
    return { ok: false, error: 'pass requestHash or agentId' };
  });

server.start();
