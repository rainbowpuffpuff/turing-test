#!/usr/bin/env node
// pharos-agent-escrow — MCP server
// Trustless escrow for agent↔agent (and human↔agent) service commerce on Pharos.
// Wraps the AgentEscrow contract (contracts/AgentEscrow.sol, deployed on
// Atlantic testnet — address in assets/deployments.json or PHAROS_ESCROW_ADDRESS).
//
// Flow: client create() with locked PHRS → worker accept() → worker deliver(hash)
//       → client release()  (or claimAfterWindow / refund / dispute paths)
//
// Tools:
//   create_escrow      — lock funds for a task (open or directed)
//   accept_task        — worker accepts an open task
//   submit_delivery    — worker anchors delivery proof (hash of artifact)
//   release_payment    — client releases funds to worker
//   claim_after_window — worker claims after undisputed window
//   refund_expired     — client refunds expired/unaccepted escrow
//   open_dispute       — client disputes within window
//   propose_resolution — either party proposes/accepts a split (bps)
//   get_escrow         — read full escrow state
//   hash_artifact      — keccak256 of a task spec / delivery payload (for proofs)
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, parseUnits, formatUnits, keccak, bytesToHex, utf8, checksum } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, getNetwork } from './lib/pharos.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const VERSION = '1.0.0';
const __dir = dirname(fileURLToPath(import.meta.url));

function escrowAddress(network) {
  if (process.env.PHAROS_ESCROW_ADDRESS) return process.env.PHAROS_ESCROW_ADDRESS;
  try {
    const dep = JSON.parse(readFileSync(join(__dir, '..', 'assets', 'deployments.json'), 'utf8'));
    const net = getNetwork(network).name;
    if (dep[net]?.AgentEscrow) return dep[net].AgentEscrow;
  } catch {}
  throw new Error('AgentEscrow address unknown: set PHAROS_ESCROW_ADDRESS or assets/deployments.json');
}

const STATUS = ['Open', 'Accepted', 'Delivered', 'Released', 'Refunded', 'Disputed'];

async function sendAndReport(wallet, to, data, value = 0n, network) {
  const { hash } = await wallet.sendTx({ to, data, value });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  return { ok: rcpt.status === '0x1', txHash: hash, gasUsed: Number(rcpt.gasUsed), explorer: txLink(hash, network), receipt: rcpt };
}

function parseEscrowTuple(hexData) {
  // Escrow struct: (address client, address worker, uint96 amount, uint40 deadline,
  //                 uint40 disputeWindow, uint40 deliveredAt, uint8 status, bytes32 taskHash, bytes32 deliveryHash)
  const fields = abiDecode(
    ['address', 'address', 'uint96', 'uint40', 'uint40', 'uint40', 'uint8', 'bytes32', 'bytes32'],
    hexData
  );
  return {
    client: fields[0],
    worker: fields[1],
    amount: formatUnits(fields[2], 18),
    amountWei: fields[2].toString(),
    deadline: new Date(Number(fields[3]) * 1000).toISOString(),
    disputeWindowSeconds: Number(fields[4]),
    deliveredAt: Number(fields[5]) ? new Date(Number(fields[5]) * 1000).toISOString() : null,
    status: STATUS[Number(fields[6])] ?? String(fields[6]),
    taskHash: fields[7],
    deliveryHash: fields[8],
  };
}

const server = new McpServer({
  name: 'pharos-agent-escrow',
  version: VERSION,
  instructions: 'Trustless task escrow between agents on Pharos: lock payment, deliver with on-chain proof, release/refund/dispute. Write ops need PHAROS_PRIVATE_KEY.',
});

// ---------------------------------------------------------------- hash_artifact
server.tool(
  'hash_artifact',
  'Compute keccak256 of a task specification or delivery artifact (string). Use the hash as taskHash when creating an escrow, and as deliveryHash when submitting work — anchoring off-chain content on-chain.',
  { type: 'object', properties: { content: { type: 'string', minLength: 1 } }, required: ['content'] },
  async ({ content }) => ({ ok: true, hash: bytesToHex(keccak(utf8(content))), bytes: content.length })
);

// ---------------------------------------------------------------- create_escrow
server.tool(
  'create_escrow',
  'Create and fund an escrow with native PHRS. worker=0x0 (or omitted) makes it an open task anyone can accept. amount is in human units (e.g. "0.01"). deadlineMinutes from now. disputeWindowMinutes after delivery.',
  {
    type: 'object',
    properties: {
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      worker: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'optional designated worker' },
      deadlineMinutes: { type: 'integer', minimum: 1, description: 'time for worker to deliver (default 60)' },
      disputeWindowMinutes: { type: 'integer', minimum: 0, description: 'client dispute window after delivery (default 30)' },
      taskSpec: { type: 'string', description: 'task description — hashed on-chain as taskHash' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['amount', 'taskSpec'],
  },
  async ({ amount, worker = '0x0000000000000000000000000000000000000000', deadlineMinutes = 60, disputeWindowMinutes = 30, taskSpec, network }) => {
    const wallet = walletFor(network);
    const addr = escrowAddress(network);
    const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;
    const taskHash = bytesToHex(keccak(utf8(taskSpec)));
    const data = encodeCall('create(address,uint40,uint40,bytes32)', [worker, deadline, disputeWindowMinutes * 60, taskHash]);
    const res = await sendAndReport(wallet, addr, data, parseUnits(amount, 18), network);
    if (!res.ok) return { ok: false, error: 'create reverted', ...res };
    // escrow id from EscrowCreated event (topic1)
    const created = res.receipt.logs?.find((l) => l.address.toLowerCase() === addr.toLowerCase());
    const id = created ? Number(BigInt(created.topics[1])) : null;
    return { ok: true, escrowId: id, contract: addr, taskHash, deadline: new Date(deadline * 1000).toISOString(), txHash: res.txHash, explorer: res.explorer };
  }
);

// ---------------------------------------------------------------- accept_task
server.tool(
  'accept_task',
  'Accept an open escrow task as the worker (your PHAROS_PRIVATE_KEY address becomes the designated worker).',
  { type: 'object', properties: { escrowId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['escrowId'] },
  async ({ escrowId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('accept(uint256)', [escrowId]), 0n, network);
    return res.ok ? { ok: true, escrowId, worker: wallet.address, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'accept reverted (already accepted? past deadline?)', ...res };
  }
);

// ---------------------------------------------------------------- submit_delivery
server.tool(
  'submit_delivery',
  'Submit delivery proof as the worker: pass the delivery content (hashed automatically) or a precomputed 0x hash.',
  {
    type: 'object',
    properties: {
      escrowId: { type: 'integer', minimum: 0 },
      deliveryContent: { type: 'string', description: 'artifact content to hash' },
      deliveryHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$', description: 'alternative: precomputed hash' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['escrowId'],
  },
  async ({ escrowId, deliveryContent, deliveryHash, network }) => {
    if (!deliveryContent && !deliveryHash) return { ok: false, error: 'pass deliveryContent or deliveryHash' };
    const hash = deliveryHash ?? bytesToHex(keccak(utf8(deliveryContent)));
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('deliver(uint256,bytes32)', [escrowId, hash]), 0n, network);
    return res.ok ? { ok: true, escrowId, deliveryHash: hash, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'deliver reverted (not worker? past deadline?)', ...res };
  }
);

// ---------------------------------------------------------------- release_payment
server.tool(
  'release_payment',
  'As the client, release escrowed funds to the worker (accept the delivery).',
  { type: 'object', properties: { escrowId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['escrowId'] },
  async ({ escrowId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('release(uint256)', [escrowId]), 0n, network);
    return res.ok ? { ok: true, escrowId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'release reverted (not client?)', ...res };
  }
);

// ---------------------------------------------------------------- claim_after_window
server.tool(
  'claim_after_window',
  'As the worker, self-claim payment after the dispute window passed with no dispute.',
  { type: 'object', properties: { escrowId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['escrowId'] },
  async ({ escrowId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('claimAfterWindow(uint256)', [escrowId]), 0n, network);
    return res.ok ? { ok: true, escrowId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'claim reverted (window still open? disputed?)', ...res };
  }
);

// ---------------------------------------------------------------- refund_expired
server.tool(
  'refund_expired',
  'As the client, reclaim funds from an unaccepted task or one whose deadline passed without delivery.',
  { type: 'object', properties: { escrowId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['escrowId'] },
  async ({ escrowId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('refund(uint256)', [escrowId]), 0n, network);
    return res.ok ? { ok: true, escrowId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'refund reverted (delivered? not expired?)', ...res };
  }
);

// ---------------------------------------------------------------- open_dispute
server.tool(
  'open_dispute',
  'As the client, open a dispute during the dispute window after delivery.',
  { type: 'object', properties: { escrowId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['escrowId'] },
  async ({ escrowId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('dispute(uint256)', [escrowId]), 0n, network);
    return res.ok ? { ok: true, escrowId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'dispute reverted (window closed?)', ...res };
  }
);

// ---------------------------------------------------------------- propose_resolution
server.tool(
  'propose_resolution',
  'Propose (or accept) a dispute resolution split. workerShareBps: 0-10000 (e.g. 5000 = 50% to worker). When both parties call with the same value, funds settle automatically.',
  {
    type: 'object',
    properties: {
      escrowId: { type: 'integer', minimum: 0 },
      workerShareBps: { type: 'integer', minimum: 0, maximum: 10000 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['escrowId', 'workerShareBps'],
  },
  async ({ escrowId, workerShareBps, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, escrowAddress(network), encodeCall('proposeResolution(uint256,uint256)', [escrowId, workerShareBps]), 0n, network);
    if (!res.ok) return { ok: false, error: 'proposeResolution reverted', ...res };
    const settled = (res.receipt.logs ?? []).some((l) => l.topics?.[0] === bytesToHex(keccak(utf8('DisputeResolved(uint256,uint256)'))));
    return { ok: true, escrowId, workerShareBps, settled, txHash: res.txHash, explorer: res.explorer, note: settled ? 'Both parties agreed — funds distributed.' : 'Proposal recorded; waiting for counterparty to match.' };
  }
);

// ---------------------------------------------------------------- get_escrow
server.tool(
  'get_escrow',
  'Read the full state of an escrow by id.',
  { type: 'object', properties: { escrowId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['escrowId'] },
  async ({ escrowId, network }) => {
    const rpc = rpcFor(network);
    const addr = escrowAddress(network);
    const out = await rpc.ethCall(addr, encodeCall('get(uint256)', [escrowId]));
    if (!out || out === '0x') return { ok: false, error: 'escrow not found' };
    return { ok: true, escrowId, contract: addr, ...parseEscrowTuple(out) };
  }
);

server.start();
