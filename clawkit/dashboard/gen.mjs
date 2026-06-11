// gen.mjs — generate the ClawKit public dashboard (self-contained HTML).
// Embeds: skill catalog, deployments, demo log, agent journal — and reads
// LIVE chain state from Mantle Sepolia + Pharos Atlantic in the browser
// (both RPCs have open CORS).
import { readFileSync, writeFileSync, existsSync } from 'fs';

const ROOT = '/agent/workspace/pharos';
const meta = JSON.parse(readFileSync(`${ROOT}/meta/skillmeta.json`, 'utf8'));
const demoLog = JSON.parse(readFileSync(`${ROOT}/meta/demo-log.json`, 'utf8'));
const pharosDep = JSON.parse(readFileSync(`${ROOT}/deployments.json`, 'utf8'));
const mantleDepPath = `${ROOT}/deployments-mantle.json`;
const mantleDep = existsSync(mantleDepPath) ? JSON.parse(readFileSync(mantleDepPath, 'utf8')) : null;
const journalPath = `${ROOT}/meta/economy-journal-mantle-sepolia.json`;
const journalFallback = `${ROOT}/meta/agent-journal-atlantic-testnet.json`;
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8'))
  : existsSync(journalFallback) ? JSON.parse(readFileSync(journalFallback, 'utf8')) : { journal: [] };

const NETS = {
  'mantle-sepolia': { label: 'Mantle Sepolia', rpc: 'https://rpc.sepolia.mantle.xyz', chainId: 5003, explorer: 'https://sepolia.mantlescan.xyz', sym: 'MNT', accent: '#65e2b0' },
  'atlantic-testnet': { label: 'Pharos Atlantic', rpc: 'https://atlantic.dplabs-internal.com', chainId: 688689, explorer: 'https://atlantic.pharosscan.xyz', sym: 'PHRS', accent: '#79c0ff' },
};

const skillRows = Object.entries(meta).map(([id, m]) => {
  const claw = id.replace('pharos-', '');
  return { id, claw, title: m.title.replace('Pharos ', ''), tagline: m.tagline, tools: m.tools, category: m.category, contract: m.usesContract };
});

const mantleContracts = mantleDep?.['mantle-sepolia'] ?? {};
const pharosContracts = pharosDep['atlantic-testnet'] ?? {};

const txProofs = [];
for (const [skill, steps] of Object.entries(demoLog.demos ?? {})) {
  for (const s of steps) if (s.result?.ok && s.result?.txHash) txProofs.push({ skill: skill.replace('pharos-', ''), step: s.step, tx: s.result.txHash, net: 'atlantic-testnet' });
}
const mantleProofPath = `${ROOT}/meta/demo-log-mantle.json`;
if (existsSync(mantleProofPath)) {
  const ml = JSON.parse(readFileSync(mantleProofPath, 'utf8'));
  for (const [skill, steps] of Object.entries(ml.demos ?? {})) {
    for (const s of steps) if (s.result?.ok && s.result?.txHash) txProofs.push({ skill: skill.replace('pharos-', ''), step: s.step, tx: s.result.txHash, net: 'mantle-sepolia' });
  }
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClawKit — Agent Economy Skills for Mantle</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0e14;--panel:#10161f;--panel2:#151d29;--line:#1f2a38;--txt:#dde6f0;--dim:#7d8b9d;--mnt:#65e2b0;--ph:#79c0ff;--amber:#f0b35e;--red:#ff7a7a;--mono:'JetBrains Mono',monospace;--sans:'Space Grotesk',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font-family:var(--sans);line-height:1.55;padding:0 5%}
a{color:var(--mnt);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1180px;margin:0 auto}
header{padding:64px 0 40px;border-bottom:1px solid var(--line)}
.crumb{font-family:var(--mono);font-size:13px;color:var(--dim);letter-spacing:.08em;text-transform:uppercase}
h1{font-size:clamp(34px,5vw,56px);font-weight:700;margin:14px 0 10px;letter-spacing:-.02em}
h1 .claw{color:var(--mnt)}
.lede{font-size:18px;color:var(--dim);max-width:760px}
.badges{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
.badge{font-family:var(--mono);font-size:12px;padding:5px 12px;border:1px solid var(--line);border-radius:999px;color:var(--dim)}
.badge b{color:var(--txt);font-weight:600}
section{padding:46px 0;border-bottom:1px solid var(--line)}
h2{font-size:13px;font-family:var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mnt);margin-bottom:22px}
h2 .n{color:var(--dim)}
.grid{display:grid;gap:14px}
@media(min-width:760px){.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g5{grid-template-columns:repeat(5,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}
.stat .v{font-family:var(--mono);font-size:26px;font-weight:600}
.stat .k{font-size:12.5px;color:var(--dim);margin-top:3px}
.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--mnt);margin-right:7px;animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.mono{font-family:var(--mono);font-size:13px}
.tag{display:inline-block;font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);color:var(--dim);margin:1px 2px 1px 0}
.net-mnt{color:var(--mnt)}.net-ph{color:var(--ph)}
.skill{display:flex;flex-direction:column;gap:8px}
.skill h3{font-size:17px}
.skill .tl{font-size:13.5px;color:var(--dim)}
.kbd{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:14px 16px;font-family:var(--mono);font-size:13px;overflow-x:auto;white-space:pre}
.j{font-family:var(--mono);font-size:13px}
.j .ph{color:var(--amber)}.j .ag{color:var(--ph)}.j .tx a{color:var(--mnt)}
.j-row{padding:7px 10px;border-left:2px solid var(--line);margin:4px 0;background:var(--panel)}
.j-row.has-tx{border-left-color:var(--mnt)}
footer{padding:42px 0 64px;color:var(--dim);font-size:14px}
.flow{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.flow .step{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center}
.flow .step b{display:block;font-family:var(--mono);font-size:12px;color:var(--mnt);letter-spacing:.1em;margin-bottom:6px}
.flow .step span{font-size:12.5px;color:var(--dim)}
.err{color:var(--red);font-family:var(--mono);font-size:12px}
.addr-pill{font-family:var(--mono);font-size:12px;word-break:break-all}
.note{font-size:13px;color:var(--dim);margin-top:12px}
</style>
</head>
<body><div class="wrap">

<header>
  <div class="crumb">The Turing Test Hackathon 2026 · Agentic Wallets &amp; Economy + AI DevTools</div>
  <h1><span class="claw">Claw</span>Kit</h1>
  <p class="lede">An agent-economy skill suite for Mantle: 10 OpenClaw/RealClaw-loadable skills (60 tools) that let AI agents pay, earn, hire, bill, identify, and observe — with original contracts deployed on Mantle Sepolia and every agent decision verifiable on-chain.</p>
  <div class="badges">
    <span class="badge"><b>60</b> agent tools</span>
    <span class="badge"><b>10</b> skills</span>
    <span class="badge"><b>5</b> original contracts</span>
    <span class="badge"><b>0</b> npm dependencies</span>
    <span class="badge">RealClaw-extensible</span>
    <span class="badge">ERC-4337 native</span>
  </div>
</header>

<section>
  <h2>Live network state <span class="n">— read in your browser, directly from chain RPCs</span></h2>
  <div class="grid g2">
    ${Object.entries(NETS).map(([key, n]) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong style="color:${n.accent}">${n.label}</strong>
        <span class="mono" style="font-size:12px;color:var(--dim)">chainId ${n.chainId}</span>
      </div>
      <div class="grid g3">
        <div class="stat"><div class="v" id="${key}-block"><span class="live"></span>…</div><div class="k">latest block</div></div>
        <div class="stat"><div class="v" id="${key}-gas">…</div><div class="k">gas price</div></div>
        <div class="stat"><div class="v" id="${key}-bal">…</div><div class="k">agent wallet ${n.sym}</div></div>
      </div>
      <div class="note" id="${key}-status">connecting…</div>
    </div>`).join('')}
  </div>
</section>

<section>
  <h2>Deployed contracts <span class="n">— original Solidity, MIT, source in repo</span></h2>
  <div class="card">
  <table>
    <thead><tr><th>Contract</th><th>Mantle Sepolia</th><th>Pharos Atlantic (origin chain)</th></tr></thead>
    <tbody>
      ${['AgentEscrow', 'StreamPay', 'InvoiceBook', 'AgentRegistry', 'AgentToken'].map((c) => {
        const m = mantleContracts[c];
        const p = pharosContracts[c] ?? (c === 'AgentToken' ? '0x14c957c36e438aEFAE0E0bd241Ec75a06aF06C3e' : null);
        return `<tr>
          <td><strong>${c}</strong></td>
          <td class="addr-pill">${m ? `<a class="net-mnt" href="${NETS['mantle-sepolia'].explorer}/address/${m}" target="_blank" rel="noopener noreferrer">${m}</a>` : '<span class="err">deploying…</span>'}</td>
          <td class="addr-pill">${p ? `<a class="net-ph" href="${NETS['atlantic-testnet'].explorer}/address/${p}" target="_blank" rel="noopener noreferrer">${p}</a>` : '—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <p class="note">The suite is chain-portable by design — the same skills run against both networks by switching one parameter. Mantle is the submission target; Pharos deployments demonstrate portability.</p>
  </div>
</section>

<section>
  <h2>The autonomous loop <span class="n">— what the agent does without a human</span></h2>
  <div class="flow">
    <div class="step"><b>OBSERVE</b><span>scan escrow board + network state via chain-sentinel</span></div>
    <div class="step"><b>DECIDE</b><span>policy engine: price floor, deadline risk, capability match</span></div>
    <div class="step"><b>EXECUTE</b><span>run inference → anchor result hash on-chain via deliver()</span></div>
    <div class="step"><b>VERIFY</b><span>client re-hashes artifact vs on-chain proof → release</span></div>
    <div class="step"><b>RECOVER</b><span>adaptive retries, graceful degradation, dispute path</span></div>
  </div>
  <div style="margin-top:18px" class="card">
    <div style="margin-bottom:10px"><strong>Decision journal</strong> <span class="note">(${journal.network ?? 'testnet'} run — every thought logged, every action a tx)</span></div>
    <div class="j">
      ${(journal.journal ?? []).slice(0, 18).map((j) => `
      <div class="j-row${j.txHash ? ' has-tx' : ''}">
        <span class="ag">[${j.agent}]</span> <span class="ph">${j.phase}</span> ${j.thought}
        ${j.txHash ? `<div class="tx">→ <a href="${(NETS[journal.network] ?? NETS['atlantic-testnet']).explorer}/tx/${j.txHash}" target="_blank" rel="noopener noreferrer">${j.txHash.slice(0, 34)}…</a></div>` : ''}
      </div>`).join('')}
    </div>
  </div>
</section>

<section>
  <h2>ERC-8004 — the hackathon's agent standard, implemented & live <span class="n">— identity · reputation · validation</span></h2>
  <div class="grid g3">
    <div class="card stat"><div class="v" id="e84-rep">…</div><div class="k">ERC-8004 reputation (agent #1, live read)</div></div>
    <div class="card stat"><div class="v" id="e84-val">…</div><div class="k">validation score (independent validator, live)</div></div>
    <div class="card stat"><div class="v">NFT #1</div><div class="k">agent identity minted via register() — registration-v1 data:URI</div></div>
  </div>
  <div class="card" style="margin-top:14px">
  <table>
    <thead><tr><th>Registry</th><th>Address (Sourcify exact_match)</th></tr></thead>
    <tbody>
      ${['ERC8004IdentityRegistry','ERC8004ReputationRegistry','ERC8004ValidationRegistry'].map((c)=>`<tr><td><strong>${c.replace('ERC8004','')}</strong></td><td class="addr-pill"><a class="net-mnt" href="https://sepolia.mantlescan.xyz/address/${mantleContracts[c]}" target="_blank" rel="noopener noreferrer">${mantleContracts[c] ?? ''}</a></td></tr>`).join('')}
    </tbody>
  </table>
  <p class="note">Original dependency-free implementation of the ERC-8004 draft (ERC-721 identity NFTs, giveFeedback reputation signals, 0-100 validator responses). The autonomous worker's labor, payment, reputation, and validation all live in these registries — agent performance benchmarkable straight from chain data.</p>
  </div>
</section>

<section>
  <h2>Hire the agent <span class="n">— post a real task from your wallet</span></h2>
  <div class="card">
    <p style="font-size:14.5px;margin-bottom:12px">Connect a wallet on <b>Mantle Sepolia (5003)</b> and lock 0.0005 MNT into the AgentEscrow as an open task. Run <span class="mono">node clawkit-economy.mjs</span> from the repo and the autonomous worker will evaluate it against policy, execute, anchor its inference hash on-chain, and collect payment.</p>
    <button id="hireBtn" style="background:var(--mnt);color:#08231a;font-family:var(--mono);font-weight:600;border:0;border-radius:8px;padding:11px 22px;font-size:14px;cursor:pointer">⛓ Post demo task (0.0005 MNT)</button>
    <span id="hireStatus" class="note" style="margin-left:12px"></span>
  </div>
</section>

<section>
  <h2>Skill catalog <span class="n">— install into RealClaw/OpenClaw or any MCP runtime</span></h2>
  <div class="kbd"># RealClaw / OpenClaw (skills install from the repo)
npx skills add rainbowpuffpuff/turing-test --skill escrow,sentinel,payroll

# any MCP runtime (Claude Desktop, Cursor, custom agents)
node clawkit/escrow/src/server.mjs        # stdio MCP server — zero npm deps</div>
  <div class="grid g2" style="margin-top:14px">
    ${skillRows.map((s) => `
    <div class="card skill">
      <h3>${s.title}</h3>
      <div class="tl">${s.tagline}</div>
      <div>${s.tools.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      ${s.contract ? `<div class="note">⛓ ${s.contract.split('(')[0]}</div>` : ''}
    </div>`).join('')}
  </div>
</section>

<section>
  <h2>On-chain proof <span class="n">— ${txProofs.length} verified transactions across both networks</span></h2>
  <div class="card" style="max-height:420px;overflow-y:auto">
  <table>
    <thead><tr><th>Network</th><th>Skill</th><th>Action</th><th>Transaction</th></tr></thead>
    <tbody>
      ${txProofs.map((p) => {
        const n = NETS[p.net];
        return `<tr>
          <td><span class="${p.net === 'mantle-sepolia' ? 'net-mnt' : 'net-ph'} mono" style="font-size:12px">${n.label}</span></td>
          <td class="mono" style="font-size:12px">${p.skill}</td>
          <td style="font-size:13px">${p.step}</td>
          <td class="mono" style="font-size:12px"><a class="${p.net === 'mantle-sepolia' ? 'net-mnt' : 'net-ph'}" href="${n.explorer}/tx/${p.tx}" target="_blank" rel="noopener noreferrer">${p.tx.slice(0, 26)}…</a></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  </div>
</section>

<section>
  <h2>Architecture <span class="n">— why judges can audit this in minutes</span></h2>
  <div class="grid g3">
    <div class="card"><strong>Zero-dependency runtime</strong><p class="note">Own EVM stack — RLP, EIP-1559 signing, ABI codec, EIP-712 — verified against known-answer test vectors, over vendored audited @noble crypto. From-scratch MCP server. Nothing to supply-chain-attack; the whole runtime is ~1,200 auditable lines.</p></div>
    <div class="card"><strong>Account abstraction built in</strong><p class="note">Smart-account skill drives the canonical ERC-4337 EntryPoint + factory (verified present on Mantle Sepolia): deterministic addresses, batched execution — the base for gasless agent UX via paymasters.</p></div>
    <div class="card"><strong>Safety rails for autonomy</strong><p class="note">Hard spend caps, session budgets, confirm-gates on irreversible actions, JSON-schema validation on every call, policy engine for task acceptance — autonomy without unbounded risk.</p></div>
  </div>
</section>

<footer>
  ClawKit · The Turing Test Hackathon 2026 (Mantle) · repo: <a href="https://github.com/rainbowpuffpuff/turing-test" target="_blank" rel="noopener noreferrer">rainbowpuffpuff/turing-test</a> · suite also live on Pharos as PharosKit · MIT
</footer>

</div>
<script>
const NETS = ${JSON.stringify(Object.fromEntries(Object.entries(NETS).map(([k, n]) => [k, { rpc: n.rpc, sym: n.sym }])))};
const AGENT = '0xc5f02b179A156414b72Af7d2E5998Ac754F69a09';
async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
async function refresh(key) {
  const n = NETS[key];
  try {
    const [blk, gas, bal] = await Promise.all([
      rpc(n.rpc, 'eth_blockNumber', []),
      rpc(n.rpc, 'eth_gasPrice', []),
      rpc(n.rpc, 'eth_getBalance', [AGENT, 'latest']),
    ]);
    document.getElementById(key + '-block').innerHTML = '<span class="live"></span>' + parseInt(blk, 16).toLocaleString();
    document.getElementById(key + '-gas').textContent = (parseInt(gas, 16) / 1e9).toFixed(1) + ' gwei';
    document.getElementById(key + '-bal').textContent = (parseInt(bal, 16) / 1e18).toFixed(4);
    document.getElementById(key + '-status').textContent = 'live · refreshes every 12s · agent wallet ' + AGENT.slice(0, 10) + '…';
  } catch (e) {
    document.getElementById(key + '-status').innerHTML = '<span class="err">rpc unreachable from your network — proofs above remain verifiable on the explorer</span>';
  }
}
for (const k of Object.keys(NETS)) { refresh(k); setInterval(() => refresh(k), 12000); }
// ── ERC-8004 live summaries (precomputed calldata; fixed-offset decode) ──
const E84 = ${JSON.stringify({ rep: mantleContracts['ERC8004ReputationRegistry'], val: mantleContracts['ERC8004ValidationRegistry'], escrow: mantleContracts['AgentEscrow'] })};
async function e84refresh() {
  try {
    const enc = (sel) => sel + '0000000000000000000000000000000000000000000000000000000000000001' +
      '0000000000000000000000000000000000000000000000000000000000000060' +
      '0000000000000000000000000000000000000000000000000000000000000080' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000';
    const repOut = await rpc(NETS['mantle-sepolia'].rpc, 'eth_call', [{ to: E84.rep, data: enc('0x1b7cabd6') }, 'latest']);
    const valOut = await rpc(NETS['mantle-sepolia'].rpc, 'eth_call', [{ to: E84.val, data: enc('0x1b7cabd6') }, 'latest']);
    const cnt = (h) => parseInt(h.slice(2, 66), 16);
    const avg = (h) => parseInt(h.slice(66, 130), 16);
    document.getElementById('e84-rep').textContent = cnt(repOut) + '× · avg ' + avg(repOut) + '/100';
    document.getElementById('e84-val').textContent = cnt(valOut) + '× · avg ' + avg(valOut) + '/100';
  } catch (e) {
    document.getElementById('e84-rep').textContent = 'see explorer';
    document.getElementById('e84-val').textContent = 'see explorer';
  }
}
e84refresh(); setInterval(e84refresh, 15000);
// ── hire-the-agent: post an open escrow task from the user's wallet ──
document.getElementById('hireBtn').onclick = async () => {
  const S = document.getElementById('hireStatus');
  if (!window.ethereum) { S.textContent = 'no wallet detected — install MetaMask'; return; }
  try {
    const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x138b' }] }); }
    catch (sw) { if (sw.code === 4902) await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x138b', chainName: 'Mantle Sepolia', rpcUrls: ['https://rpc.sepolia.mantle.xyz'], nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 }, blockExplorerUrls: ['https://sepolia.mantlescan.xyz'] }] }); }
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    // create(address worker=0x0, uint40 deadline, uint40 disputeWindow=600, bytes32 taskHash=keccak("clawkit dashboard demo task"))
    const data = '0x' + '5743b75f' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      deadline.toString(16).padStart(64, '0') +
      '0000000000000000000000000000000000000000000000000000000000000258' +
      'e447e80ffc668f35d173552af49c1cb469eff296f3134718654979c301f3ef8e';
    const tx = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: E84.escrow, value: '0x1c6bf52634000', data }] });
    S.innerHTML = 'task posted! <a href="https://sepolia.mantlescan.xyz/tx/' + tx + '" target="_blank" rel="noopener noreferrer">view tx</a> — the agent daemon will evaluate it';
  } catch (e) { S.textContent = 'cancelled / error: ' + (e.message || e).toString().slice(0, 80); }
};
</script>
</body>
</html>`;

writeFileSync(`${ROOT}/dashboard/index.html`, html);
console.log('dashboard generated:', html.length, 'bytes');
