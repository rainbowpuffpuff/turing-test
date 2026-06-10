<div align="center">

# Pharos Stream Pay

**Per-second payment streams: pay an agent continuously while it works.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

An original StreamPay contract on Pharos Atlantic testnet vests native PHRS linearly from payer to recipient. The recipient (e.g. a working agent) withdraws vested funds at any moment; the payer can top-up (extending the stream at the same rate) or cancel with fair to-the-second settlement. Built for continuous agent compensation — retainers, compute rental, long-running jobs.

## Why agents need it

The agent economy runs on payments. Pharos ships native x402 support, sub-second finality, and micro-fee transactions — this skill turns those primitives into a single tool call an LLM can make.

## Tools

| Tool | Purpose |
|------|---------|
| `quote_stream` | Plan a stream before opening: given total amount and duration, returns the per-second/minute/hour rate and end time. |
| `open_stream` | Open a payment stream: lock `amount` (human units of native PHRS) vesting linearly to `recipient` over `durationMinutes`, starting now. |
| `stream_status` | Live status of a stream: vested so far, withdrawable now, withdrawn, remaining, progress %. |
| `withdraw_vested` | As the stream recipient, withdraw everything vested so far. |
| `top_up` | As the payer, add funds to a live stream — extends its end time at the same vesting rate. |
| `cancel_stream` | Cancel a stream (payer or recipient). |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-stream-pay": { "command": "node", "args": ["pharos-stream-pay/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

StreamPay 0xb6c2312de42b48c934ab532ccbcb80ab38a71c49 (original, deployed on Atlantic testnet) — Solidity source in [`contracts/`](contracts/), original and dependency-free.

## Live proof on Atlantic testnet

- `open_stream` → [`0x17a0c812b1891621…`](https://atlantic.pharosscan.xyz/tx/0x17a0c812b18916216481e7a76ce2b260ae6b5151cca903bd7a0fc4d0c3255793)
- `withdraw_vested` → [`0xa8aa3ac7129bda6c…`](https://atlantic.pharosscan.xyz/tx/0xa8aa3ac7129bda6c2ddacff75e99a31d09286c26ebaab10c70fcaf8a8a7bd6e9)
- `cancel_stream(fair-split)` → [`0x27b19c82e4852e6c…`](https://atlantic.pharosscan.xyz/tx/0x27b19c82e4852e6c2a4d184d49af1031bf8caa3cfd66c7888d280cd8aaf6e97c)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
