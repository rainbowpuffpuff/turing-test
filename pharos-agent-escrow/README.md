<div align="center">

# Pharos Agent Escrow

**Trustless escrow for agent-to-agent service commerce: lock, deliver with proof, release.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

An original AgentEscrow contract deployed on Pharos Atlantic testnet powers trustless task commerce between agents (or humans hiring agents). Clients lock native PHRS for a task spec (hash anchored on-chain); workers accept, deliver with a keccak256 proof of the artifact, and get paid on release — with deadline refunds, a dispute window, and mutual bps-split resolution. Every state change is an indexed event.

## Why agents need it

Autonomous agents transacting with each other need trust primitives that do not rely on either party behaving. This skill provides exactly that, as an on-chain contract plus an agent-friendly tool surface.

## Tools

| Tool | Purpose |
|------|---------|
| `hash_artifact` | Compute keccak256 of a task specification or delivery artifact (string). |
| `create_escrow` | Create and fund an escrow with native PHRS. |
| `accept_task` | Accept an open escrow task as the worker (your PHAROS_PRIVATE_KEY address becomes the designated worker). |
| `submit_delivery` | Submit delivery proof as the worker: pass the delivery content (hashed automatically) or a precomputed 0x hash. |
| `release_payment` | As the client, release escrowed funds to the worker (accept the delivery). |
| `claim_after_window` | As the worker, self-claim payment after the dispute window passed with no dispute. |
| `refund_expired` | As the client, reclaim funds from an unaccepted task or one whose deadline passed without delivery. |
| `open_dispute` | As the client, open a dispute during the dispute window after delivery. |
| `propose_resolution` | Propose (or accept) a dispute resolution split. |
| `get_escrow` | Read the full state of an escrow by id. |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-agent-escrow": { "command": "node", "args": ["pharos-agent-escrow/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

AgentEscrow 0x22a43e08b67dab1f46a8f908834cd7e37e3fa3cd (original, deployed on Atlantic testnet) — Solidity source in [`contracts/`](contracts/), original and dependency-free.

## Live proof on Atlantic testnet

- `create_escrow` → [`0x2b38e9578da794b3…`](https://atlantic.pharosscan.xyz/tx/0x2b38e9578da794b37d4b6ddf07a855b67861b0310a74199fb8200f33b6facb04)
- `submit_delivery` → [`0x7fee06ef8d87b45b…`](https://atlantic.pharosscan.xyz/tx/0x7fee06ef8d87b45b915adbcd6f3310b3be90364c03e9f77880397489396348de)
- `release_payment` → [`0xdedd5d10d833fe5a…`](https://atlantic.pharosscan.xyz/tx/0xdedd5d10d833fe5ac8a70c03b6d66841f5427e62bca0320cba9632e2dec1b688)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
