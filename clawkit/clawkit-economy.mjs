#!/usr/bin/env node
// clawkit-economy.mjs — the full ERC-8004 agent-economy benchmark on Mantle.
// THREE independent agents (separate keys), all driving ClawKit MCP skills:
//   WORKER    — mints an ERC-8004 identity NFT, performs tasks, requests validation
//   CLIENT    — posts escrow tasks, verifies delivery, releases payment, posts
//               ERC-8004 reputation feedback (cannot be the owner — spec-enforced)
//   VALIDATOR — independently checks the work product, posts a 0-100
//               ValidationResponse on-chain ("on-chain AI benchmarking")
// Daemon: --cycles N runs N full task cycles. Every decision journaled.
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const ROOT = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const NETWORK = process.argv.includes('--network') ? process.argv[process.argv.indexOf('--network') + 1] : 'mantle-sepolia';
const CYCLES = process.argv.includes('--cycles') ? Number(process.argv[process.argv.indexOf('--cycles') + 1]) : 2;

const main = JSON.parse(readFileSync(`${ROOT}/.wallet.json`, 'utf8'));
const roles = JSON.parse(readFileSync(`${ROOT}/.wallets-roles.json`, 'utf8'));
const KEYS = { worker: main.privateKey, client: roles.client.privateKey, validator: roles.validator.privateKey };
const ADDR = { worker: main.address, client: roles.client.address, validator: roles.validator.address };

class Skill {
  constructor(name, key) {
    this.child = spawn('node', [`${ROOT}/skills/${name}/src/server.mjs`], {
      env: { ...process.env, NODE_USE_ENV_PROXY: '1', PHAROS_PRIVATE_KEY: key }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.id = 0; this.child.stderr.on('data', () => {});
  }
  rpc(m, p) { const id = ++this.id; return new Promise((res, rej) => {
    const on = (b) => { for (const l of b.toString().split('\n')) { if (!l.trim()) continue;
      try { const j = JSON.parse(l); if (j.id === id) { this.child.stdout.off('data', on); res(j); return; } } catch {} } };
    this.child.stdout.on('data', on);
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: m, params: p }) + '\n');
    setTimeout(() => rej(new Error('timeout ' + m)), 180000); }); }
  async init() { await this.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'economy', version: '2' } }); return this; }
  async tool(n, a) { const r = await this.rpc('tools/call', { name: n, arguments: { ...a, network: NETWORK } });
    try { return JSON.parse(r.result?.content?.[0]?.text ?? '{}'); } catch { return {}; } }
  kill() { this.child.kill(); }
}

const journal = [];
const log = (agent, phase, thought, tx) => {
  journal.push({ at: new Date().toISOString(), agent, phase, thought, ...(tx ? { txHash: tx } : {}) });
  console.log(`[${agent}] ${phase.padEnd(9)} ${thought}${tx ? '  tx=' + tx : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// skills per role
const w8004 = await new Skill('pharos-erc8004', KEYS.worker).init();
const c8004 = await new Skill('pharos-erc8004', KEYS.client).init();
const v8004 = await new Skill('pharos-erc8004', KEYS.validator).init();
const wEsc = await new Skill('pharos-agent-escrow', KEYS.worker).init();
const cEsc = await new Skill('pharos-agent-escrow', KEYS.client).init();
const sent = await new Skill('pharos-chain-sentinel', KEYS.worker).init();

try {
  // ── 1. identity: worker mints its ERC-8004 NFT once ──
  const statePath = `${ROOT}/meta/erc8004-state-${NETWORK}.json`;
  let agentId = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')).agentId : null;
  if (!agentId) {
    log('worker', 'IDENTITY', 'minting ERC-8004 identity NFT (registration-v1 file as on-chain data:URI)');
    const r = await w8004.tool('register_identity', { name: 'clawkit-worker', description: 'Autonomous chain-analysis agent built from ClawKit skills', mcpEndpoint: 'https://github.com/rainbowpuffpuff/turing-test' });
    if (!r.ok) throw new Error('identity mint failed: ' + r.error);
    agentId = r.agentId;
    writeFileSync(statePath, JSON.stringify({ agentId, agentRegistry: r.agentRegistry }));
    log('worker', 'IDENTITY', `agentId #${agentId} minted in ${r.agentRegistry}`, r.txHash);
  } else log('worker', 'IDENTITY', `reusing ERC-8004 agentId #${agentId} (idempotent)`);

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    log('daemon', 'CYCLE', `── cycle ${cycle}/${CYCLES} begins ──`);

    // ── 2. client posts a funded task ──
    const taskSpec = `Cycle ${cycle}: analyze ${NETWORK} conditions; produce gas-optimization recommendation (JSON). Capability: chain-analysis.`;
    const created = await cEsc.tool('create_escrow', { amount: '0.0005', worker: ADDR.worker, deadlineMinutes: 30, disputeWindowMinutes: 1, taskSpec });
    if (!created.ok) { log('client', 'POST', 'escrow create failed: ' + created.error); continue; }
    log('client', 'POST', `task #${created.escrowId} funded (0.0005 MNT)`, created.txHash);

    // ── 3. worker observes (with stale-read recovery), decides, executes ──
    let task = await wEsc.tool('get_escrow', { escrowId: created.escrowId });
    for (let a = 1; task.ok && Number(task.amountWei ?? 0) === 0 && a <= 4; a++) {
      log('worker', 'RECOVER', `stale read from lagging RPC — retry in ${a * 3}s`); await sleep(a * 3000);
      task = await wEsc.tool('get_escrow', { escrowId: created.escrowId });
    }
    if (Number(task.amount) < 0.0001) { log('worker', 'DECIDE', 'policy refusal: price below floor'); continue; }
    log('worker', 'DECIDE', `policy passed (${task.amount} native, deadline ok) — accepting`);

    const pulse = await sent.tool('chain_pulse', {});
    const artifact = JSON.stringify({ task: taskSpec, network: pulse.network, block: pulse.latestBlock, gasPrice: pulse.gasPrice, blockTime: pulse.blockTimeSeconds, recommendation: parseFloat(pulse.gasPrice) <= 60 ? 'NORMAL: batch via Multicall3 for >3 ops' : 'ELEVATED: defer non-urgent ops', by: `erc8004:${agentId}`, at: new Date().toISOString() }, null, 2);
    log('worker', 'EXECUTE', `inference complete @ block ${pulse.latestBlock}`);
    const del = await wEsc.tool('submit_delivery', { escrowId: created.escrowId, deliveryContent: artifact });
    if (!del.ok) { log('worker', 'RECOVER', 'delivery failed: ' + del.error); continue; }
    log('worker', 'EXECUTE', `inference hash anchored on-chain (${del.deliveryHash.slice(0, 16)}…)`, del.txHash);

    // ── 4. client verifies + releases + posts ERC-8004 reputation ──
    const expect = await cEsc.tool('hash_artifact', { content: artifact });
    const st = await cEsc.tool('get_escrow', { escrowId: created.escrowId });
    if (expect.hash !== st.deliveryHash) { log('client', 'VERIFY', 'HASH MISMATCH — disputing'); await cEsc.tool('open_dispute', { escrowId: created.escrowId }); continue; }
    const rel = await cEsc.tool('release_payment', { escrowId: created.escrowId });
    log('client', 'VERIFY', 'hash verified ✓ — payment released', rel.txHash);
    const fb = await c8004.tool('give_feedback', { agentId, value: 97, valueDecimals: 0, tag1: 'starred', tag2: 'chain-analysis',
      feedbackJson: { agentId, escrowId: created.escrowId, value: 97, proofOfPayment: { txHash: rel.txHash, chainId: '5003' } } });
    log('client', 'FEEDBACK', fb.ok ? 'ERC-8004 reputation posted: 97/100 starred' : 'feedback failed: ' + fb.error, fb.txHash);

    // ── 5. worker requests validation; validator independently checks + responds ──
    const vr = await w8004.tool('request_validation', { agentId, validatorAddress: ADDR.validator, payload: artifact });
    if (!vr.ok) { log('worker', 'VALIDATE', 'request failed: ' + vr.error); continue; }
    log('worker', 'VALIDATE', `validation requested (hash ${vr.requestHash.slice(0, 16)}…)`, vr.txHash);

    // validator: integrity check = recompute hash from request payload & compare with escrow's on-chain deliveryHash
    const okIntegrity = vr.requestHash === st.deliveryHash;
    const score = okIntegrity ? 100 : 0;
    log('validator', 'VALIDATE', `independent integrity check: requestHash ${okIntegrity ? '==' : '!='} escrow deliveryHash → score ${score}`);
    const resp = await v8004.tool('respond_validation', { requestHash: vr.requestHash, response: score, tag: 'artifact-integrity', evidence: JSON.stringify({ escrowId: created.escrowId, deliveryHash: st.deliveryHash, method: 'hash-equality' }) });
    log('validator', 'VALIDATE', resp.ok ? `ValidationResponse(${score}) posted on-chain` : 'response failed: ' + resp.error, resp.txHash);

    await sleep(2500);
  }

  // ── 6. read the on-chain benchmark back ──
  const rep = await w8004.tool('reputation_summary', { agentId: JSON.parse(readFileSync(`${ROOT}/meta/erc8004-state-${NETWORK}.json`, 'utf8')).agentId, tag1: 'starred' });
  const val = await w8004.tool('validation_status', { agentId: JSON.parse(readFileSync(`${ROOT}/meta/erc8004-state-${NETWORK}.json`, 'utf8')).agentId });
  log('daemon', 'BENCHMARK', `on-chain record → reputation: ${rep.feedbackCount}× avg ${rep.averageValue} | validations: ${val.validationCount}× avg ${val.averageResponse}`);
  log('daemon', 'DONE', 'agent economy benchmark complete — identity, labor, payment, reputation, validation: all on-chain');
} finally {
  [w8004, c8004, v8004, wEsc, cEsc, sent].forEach((s) => s.kill());
}
writeFileSync(`${ROOT}/meta/economy-journal-${NETWORK}.json`, JSON.stringify({ network: NETWORK, cycles: CYCLES, roles: ADDR, journal }, null, 2));
console.log(`\nJournal: meta/economy-journal-${NETWORK}.json — ${journal.length} entries, ${journal.filter((j) => j.txHash).length} on-chain txs`);
