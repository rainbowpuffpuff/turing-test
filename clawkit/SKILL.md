---
name: clawkit
description: >
  ClawKit — the agent-economy skill suite for Mantle. Extends RealClaw/OpenClaw
  agents with 10 Mantle-compatible skills (60 tools): x402 micro-payments (buy
  AND sell), trustless escrow with on-chain delivery proofs, per-second payment
  streams, batch payroll via Multicall3, on-chain invoicing, ERC-4337 smart
  accounts, agent identity & reputation, token launching, and cursor-based
  chain monitoring. Invoke when an agent needs to: pay for an API, monetize a
  capability, hire another agent, get hired, stream a salary, run payroll,
  issue an invoice, deploy a wallet or token, check reputation, or watch the
  chain. Networks: mantle-sepolia (5003), mantle (5000), plus Pharos for
  portability. Write ops sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: mantle-sepolia
  chainId: 5003
  nativeToken: MNT
tags: [mantle, realclaw, openclaw, agent-skill, mcp, agent-economy, erc4337, x402]
license: MIT
---

# ClawKit — Agent Economy Skills for Mantle

**Extend RealClaw with Mantle-compatible skills** (the Byreal-documented Mantle
integration path): ClawKit gives any OpenClaw-based agent the complete
transactional vocabulary of an on-chain economy.

## Install (RealClaw / OpenClaw)

```bash
# add the whole suite as agent skills
npx skills add rainbowpuffpuff/turing-test

# or run any skill as a standalone MCP server (zero npm dependencies)
node pharos-agent-escrow/src/server.mjs
```

Each skill folder ships this same SKILL.md manifest shape, so OpenClaw skill
discovery picks up trigger descriptions, capability tables, and reference docs
automatically.

## What the agent gains

| Skill | Agent capability | Tools |
|---|---|---|
| x402-buyer | pay for 402-gated APIs/data with hard spend caps | 4 |
| x402-merchant | charge for its own capabilities (signed receipts) | 5 |
| agent-escrow | hire / get hired with on-chain delivery proofs | 10 |
| stream-pay | earn or pay per-second while work happens | 6 |
| payroll-batch | pay a whole team in ONE Multicall3 transaction | 4 |
| invoice-book | issue & settle invoices (native + ERC-20) | 5 |
| smart-account | ERC-4337 wallets: deterministic, batched, AA-ready | 6 |
| agent-registry | on-chain identity, capabilities, attestations | 6 |
| token-launcher | deploy capped/permit ERC-20s; wrap WMNT | 8 |
| chain-sentinel | observe: balances, events, tx decode, cursor diffs | 6 |

## Skill chaining (the autonomy loop)

ClawKit skills are designed to chain — the included `clawkit-agent.mjs` runs a
fully autonomous worker an agent framework can replicate:

```
sentinel.watch → registry.lookup → POLICY DECIDE → escrow.accept
   → inference → escrow.deliver(resultHash ON-CHAIN) → client verifies hash
   → payment released → sentinel confirms → (recover on any failure)
```

Every decision is journaled; every action is a Mantle transaction — agent
performance benchmarkable directly from chain data.

## Mantle specifics handled

- 50-gwei base / high-gas-unit metering: estimates buffered, fees EIP-1559
- Canonical Multicall3 + ERC-4337 EntryPoint/factory (verified on Sepolia)
- WMNT / mETH / USDY in the token registry for RWA-aware flows
- Open-CORS public RPC → browser dashboards read live state with no backend

## Safety rails

Hard `maxPayment` caps + session budgets (x402), `confirm:true` gates on
irreversible ops, JSON-schema validation on every call, local-only signing,
policy engine for task acceptance. Autonomy without unbounded risk.
