# DoraHacks Submission — The Turing Test Hackathon 2026

## Form fields

**BUIDL name:** ClawKit — Agent Economy Skills for Mantle

**One-sentence product description (Byreal requirement):**
ClawKit extends RealClaw/OpenClaw agents with 10 Mantle-compatible skills (60 tools) so autonomous agents can pay, earn, hire, bill, identify, and observe — with every decision verifiable on-chain.

**Tracks (max 2):** Agentic Wallets & Economy (primary) · AI DevTools (secondary)

**GitHub repo:** https://github.com/rainbowpuffpuff/turing-test

**Public demo (frontend, not localhost):** https://hyperagent.com/s/u40QsCVoX3ACRwTpgRhtcQ

**Demo video (≥2 min):** <YOUTUBE_URL>

**Deployment addresses (Mantle Sepolia, chainId 5003):** see table below — REQUIRED in submission per Deployment Award rules.

---

## Project description (paste into DoraHacks editor)

### What ClawKit is

AI agents are getting hands — RealClaw gave them trading on Mantle. ClawKit gives them an **economy**: ten OpenClaw-loadable skills that cover the full transactional vocabulary an autonomous agent needs — paying for resources (x402 buyer), charging for its own capabilities (x402 merchant), hiring and getting hired with cryptographic delivery proofs (escrow), continuous compensation (per-second streams), treasury operations (Multicall3 batch payroll), B2B billing (on-chain invoices), proper wallets (ERC-4337 smart accounts), identity and reputation (registry with peer attestations), monetary tooling (token launcher, WMNT wrap), and observation (cursor-based chain sentinel).

Install into RealClaw/OpenClaw (`npx skills add rainbowpuffpuff/turing-test`) or run any skill as a zero-dependency MCP stdio server in Claude Desktop, Cursor, or a custom agent runtime.

### The autonomous loop (live, on-chain, journaled)

`clawkit-agent.mjs` runs a fully autonomous worker built only from ClawKit skills:

1. **OBSERVE** — scans the AgentEscrow task board + network state via chain-sentinel
2. **DECIDE** — a policy engine evaluates price floor, deadline risk, capability match — and *refuses* tasks that fail policy (with logged reasons)
3. **EXECUTE** — performs a real inference over live chain data and **anchors the inference result hash on-chain** via `deliver()` — the AI-powered function callable on-chain
4. **VERIFY** — the client agent re-hashes the artifact against the on-chain proof before releasing payment
5. **RECOVER** — adaptive retries, graceful degradation when registration is taken, dispute path on hash mismatch

Every decision is journaled with a reason; every action is a Mantle transaction. Agent performance is benchmarkable **directly from chain data** — exactly the on-chain AI benchmarking thesis of this hackathon.

### Scorecard mapping — Part A (Mantle general, 50 pts)

**Technical (15):** Zero-runtime-dependency architecture: own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712 — all verified against known-answer test vectors) over vendored audited @noble primitives; from-scratch MCP server (~1,200 auditable lines total runtime). JSON-schema validation on every tool call; structured `{ok,error}` results; smoke tests per skill; runs end-to-end on Mantle Sepolia (deployments + live demo log below).

**Ecosystem fit (10):** Native Mantle stack integration: canonical Multicall3 and ERC-4337 EntryPoint/SimpleAccountFactory (verified present on Sepolia by bytecode) drive the payroll and smart-account skills; WMNT/mETH/USDY in the token registry for RWA-aware flows; Mantle gas model (50-gwei base, high gas-unit metering) handled explicitly in fee logic. ClawKit is infrastructure other hackathon projects can build on — skills compose into any agent.

**Business potential (10):** Skills that charge for themselves: the x402 merchant skill lets any capability become a pay-per-call API (signed receipts included), and the buyer skill lets agents consume them under hard budget caps — a working monetization loop for the agent-skill economy, demonstrated live. GTM: ship as RealClaw skill pack; every new Claw agent is a distribution target.

**Innovation (10):** Not a fork: original contracts (escrow with delivery-proof anchoring + bps dispute splits, per-second streaming, invoice book, identity registry with Sybil-aware attestations) and an original zero-dependency runtime. New pattern: **inference-anchored escrow** — AI work product hashed on-chain as the payment condition, making agent labor verifiable.

**User experience (5):** Account abstraction built in (deterministic ERC-4337 accounts, batched execution — the base for gasless paymaster UX); public live dashboard (no wallet needed to inspect everything); every tool returns human-readable amounts + explorer links.

### Scorecard mapping — Part B (Byreal track, 50 pts)

**Byreal integration depth (18):** ClawKit takes the documented Mantle path: *"extend RealClaw with Mantle-compatible Skills, tools, or workflows."* The suite is packaged in the OpenClaw skill format RealClaw consumes (SKILL.md manifests with trigger descriptions + capability tables, installable via `npx skills add`), and the skills are designed for **extensible agent skill chaining**: sentinel→registry→escrow→inference→delivery→payment is one chain the included autonomous worker runs end-to-end; payroll→smart-account batching is another. This is purposeful infrastructure for Claw agents, not a surface API call.

**Agent autonomy (14):** The worker perceives context (live chain state), makes policy decisions (including refusals, with reasons), executes multi-step on-chain workflows without human intervention, verifies outcomes cryptographically, and recovers from errors adaptively (retry with fresh state, graceful degradation, dispute path). The full decision journal ships in the repo and renders on the dashboard.

**Use case clarity (10):** Target users: Claw agent builders who need their agents to transact (pay/earn/hire), and agent operators who need treasury ops (payroll, invoices, streams). The demo scenario — an agent paying another agent for verifiable analysis work — is the canonical agent-economy transaction.

**Verifiability & demo (8):** Everything is on-chain: deployment txs, demo txs, the inference hash, the payment release. The public dashboard reads live Mantle state in your browser and links every claim to the explorer. Demo video walks the full loop.

### AI DevTools (secondary track)

chain-sentinel (tx_inspect with Mantle gas accounting, calldata decoding, event scanning) + token-launcher + the Multicall3 batch-vs-sequential gas benchmark (receipts in repo) form a Mantle developer toolkit; the zero-dependency EVM library itself is reusable Mantle tooling.

### Deployment Award checklist (objective bar)

- ✅ Smart contracts deployed on Mantle Sepolia (addresses below)
- ✅ Contracts verified: Sourcify **exact_match** on chain 5003 for all four (sourcify.dev/server/v2/contract/5003/<address>); Blockscout import pending (their API was down at submission time)
- ✅ AI-powered function callable on-chain: `AgentEscrow.deliver(inferenceResultHash)` — inference result written on-chain by the autonomous worker (journal + tx hashes in repo)
- ✅ Public frontend (dashboard URL above — not localhost)
- ✅ Deployment addresses in this submission
- ✅ Demo video ≥ 2 min
- ✅ Open-source repo with README (setup, architecture, addresses)

### Deployed contracts (Mantle Sepolia)

| Contract | Address | Deploy tx |
|---|---|---|
| AgentEscrow | 0x22a43e08b67dab1f46a8f908834cd7e37e3fa3cd | 0x0cd452a1684968c8c1810475f37c0dadb1be006158e8f9fa5ee00540bc3cfdc4 |
| StreamPay | 0xb6c2312de42b48c934ab532ccbcb80ab38a71c49 | 0xd5bfc0dbbeb6906c3e6b4329ec20f9ed7961adf9c0b9ce770f3bdf4722e1d4db |
| InvoiceBook | 0x8a026720e7d83737a286c31f5eaaf8283751e96e | 0xf2693dec25fe84c04bc8b204ce54847063f44c19cb7e0955df00c8d35e8b2edb |
| AgentRegistry | 0x204ec9f83a804672121d946d3da7f66b5c7b2cc3 | 0x5ca00d530ae0c14724706f722bc0cdebb4181494ca68198f73fd1e2b53e1f149 |
| AgentToken | bytecode ships in-skill; deployed per-use (live instance on Pharos: 0x14c957c36e438aEFAE0E0bd241Ec75a06aF06C3e) | — |

*Portability proof: the same suite runs on Pharos Atlantic testnet (23 demo transactions) by switching one parameter — chain-agnostic infrastructure, Mantle-first.*
