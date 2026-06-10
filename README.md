<div align="center">

# PharosKit

**10 composable Skill modules for AI agents on [Pharos](https://pharos.xyz)**

*Built for the Skill-to-Agent Dual Cascade Hackathon — Phase 1 (Skill Hackathon), June 2026*

`MCP servers` · `zero runtime dependencies` · `5 original contracts deployed` · `23 live testnet transactions` · `MIT`

</div>

---

## The suite

The Pharos agent economy needs a base layer: ways for agents to **pay**, **earn**, **hire**, **bill**, **identify**, and **observe**. PharosKit is that layer — ten independent, composable Skill modules, each a self-contained MCP server an agent can call today.

| Skill | Category | What an agent gets | Tools |
|---|---|---|---|
| [`pharos-x402-buyer`](pharos-x402-buyer/) | Payments | PAY for x402-gated APIs/content — with hard spend caps | 4 |
| [`pharos-x402-merchant`](pharos-x402-merchant/) | Payments | EARN by selling any resource behind an x402 paywall | 5 |
| [`pharos-stream-pay`](pharos-stream-pay/) | Payments | Per-second payment streams (pay while working) | 6 |
| [`pharos-agent-escrow`](pharos-agent-escrow/) | Commerce | Trustless task escrow with delivery proofs & disputes | 10 |
| [`pharos-invoice-book`](pharos-invoice-book/) | RealFi | On-chain invoices (native + ERC-20, partial payments) | 5 |
| [`pharos-payroll-batch`](pharos-payroll-batch/) | RealFi | Whole-team payouts in ONE Multicall3 transaction | 4 |
| [`pharos-smart-account`](pharos-smart-account/) | Infrastructure | ERC-4337 smart accounts: predict, deploy, batch-execute | 6 |
| [`pharos-chain-sentinel`](pharos-chain-sentinel/) | Infrastructure | Cursor-based chain monitoring (the agent's eyes) | 6 |
| [`pharos-agent-registry`](pharos-agent-registry/) | Identity | On-chain names, capabilities, peer attestations | 6 |
| [`pharos-token-launcher`](pharos-token-launcher/) | Tokens | Deploy capped/permit ERC-20s; wrap/unwrap PHRS | 8 |

**60 tools total.** Every skill follows the [`PharosNetwork/pharos-skill-engine`](https://github.com/PharosNetwork/pharos-skill-engine) manifest format (`SKILL.md` with YAML frontmatter) and runs as an MCP stdio server — drop into Claude Desktop, Cursor, or any MCP-capable runtime.

## Live on-chain proof

Everything was demonstrated against **Pharos Atlantic testnet** (chainId 688689) with real transactions — see [`pharoskit-meta/demo-log.json`](pharoskit-meta/demo-log.json) for the full machine-readable log (23 successful transactions).

**Original contracts deployed** ([addresses](pharoskit-meta/deployments.json)):

| Contract | Address | Used by |
|---|---|---|
| AgentEscrow | [`0x22a43e08…`](https://atlantic.pharosscan.xyz/address/0x22a43e08b67dab1f46a8f908834cd7e37e3fa3cd) | pharos-agent-escrow |
| StreamPay | [`0xb6c2312d…`](https://atlantic.pharosscan.xyz/address/0xb6c2312de42b48c934ab532ccbcb80ab38a71c49) | pharos-stream-pay |
| InvoiceBook | [`0x8a026720…`](https://atlantic.pharosscan.xyz/address/0x8a026720e7d83737a286c31f5eaaf8283751e96e) | pharos-invoice-book |
| AgentRegistry | [`0x204ec9f8…`](https://atlantic.pharosscan.xyz/address/0x204ec9f83a804672121d946d3da7f66b5c7b2cc3) | pharos-agent-registry |
| AgentToken (PKDC demo) | [`0x14c957c3…`](https://atlantic.pharosscan.xyz/address/0x14c957c36e438aEFAE0E0bd241Ec75a06aF06C3e) | pharos-token-launcher |

Highlights from the demo run:

- **Full x402 closed loop**: merchant paywall → buyer pays on-chain → content unlocked ([tx](https://atlantic.pharosscan.xyz/tx/0x77c18c8730734a7e8da9698ce4f7eaef1f59520c9546e0b3896e85eaabe640a1))
- **Escrow happy path**: create → deliver (proof hash) → release ([release tx](https://atlantic.pharosscan.xyz/tx/0xdedd5d10d833fe5ac8a70c03b6d66841f5427e62bca0320cba9632e2dec1b688))
- **3-recipient payroll in 1 Multicall3 tx** ([tx](https://atlantic.pharosscan.xyz/tx/0x7dfaeed04d106031d93c921986b387b31e180b16efd30de21bf93c45eee19f7e))
- **Streaming pay**: open → vest live → withdraw mid-stream → fair cancel ([open tx](https://atlantic.pharosscan.xyz/tx/0x17a0c812b18916216481e7a76ce2b260ae6b5151cca903bd7a0fc4d0c3255793))
- **ERC-4337**: counterfactual predict → deploy → batch-execute 2 token transfers in 1 tx ([batch tx](https://atlantic.pharosscan.xyz/tx/0x710915bc760f25f0cc69e5f5b014169689cae8491210b984d049265e1dc7e30c))

The entire campaign — 5 contract deployments + 23 demo transactions — ran on **less than 0.01 PHRS** from a single faucet claim. That's the Pharos micro-fee story in practice.

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712 — verified against known-answer test vectors) over vendored audited [@noble](https://github.com/paulmillr) primitives, plus a from-scratch MCP stdio server. No `npm install`, no supply-chain surface — built to pass CertiK Skill Scanner review cleanly.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links on every transaction, human-readable amounts alongside raw units, and cursor-based diffs for polling.
- **Safety rails.** Hard spending caps (`maxPayment`, session budgets), explicit `confirm: true` gates on irreversible actions, JSON-schema validation on every call, local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, public-RPC rate limits (backoff + pacing), and 1000-block log-range caps automatically.
- **Composable by convention.** Same network config, error shape, and output conventions across all 10 — agents chain them without glue code. Phase 2 Agents can be assembled directly from these blocks.

## Quick start (any skill)

```bash
cd pharos-x402-buyer        # or any other skill
node src/server.mjs          # MCP server on stdio
node test/smoke.mjs          # smoke test
```

```json
{ "mcpServers": { "pharos-x402-buyer": {
  "command": "node", "args": ["pharos-x402-buyer/src/server.mjs"],
  "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" } } } }
```

Read-only skills (`pharos-chain-sentinel`) and verification flows (`pharos-x402-merchant`) need no key at all.

## Repo layout

```
├── pharos-x402-buyer/        ┐
├── pharos-x402-merchant/     │
├── pharos-smart-account/     │
├── pharos-agent-escrow/      │   10 self-contained skills —
├── pharos-stream-pay/        │   each with SKILL.md, src/, assets/,
├── pharos-payroll-batch/     │   references/, test/, README, LICENSE
├── pharos-invoice-book/      │   (+ contracts/ where original Solidity ships)
├── pharos-agent-registry/    │
├── pharos-token-launcher/    │
├── pharos-chain-sentinel/    ┘
└── pharoskit-meta/           # deployment addresses + on-chain demo log
```

## License

MIT — every skill, every contract.
