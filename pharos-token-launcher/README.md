<div align="center">

# Pharos Token Launcher

**Agents launch their own on-chain economies: deploy capped ERC-20s with permit, mint, burn.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

Deploy an auditable AgentToken ERC-20 (compiled-in bytecode, source included): optional hard cap, owner minting that can be renounced forever, burn, and EIP-2612 permit for gasless approvals. Plus utilities every token economy needs: rich token_info for ANY ERC-20, transfers by symbol or address, and native PHRS ↔ WPHRS wrap/unwrap. Lets agents issue reward points, loyalty tokens, or project currencies in one call.

## Why agents need it

Agent economies need their own units of account — reward points, credits, project tokens. This skill lets an agent mint one in a single call, safely.

## Tools

| Tool | Purpose |
|------|---------|
| `deploy_token` | Deploy a new AgentToken ERC-20. |
| `token_info` | Read any ERC-20: name, symbol, decimals, totalSupply, plus AgentToken extras (cap, owner, mintingRenounced) when available. |
| `mint_tokens` | Mint new supply of an AgentToken you own, to any recipient (cap-respecting). |
| `burn_tokens` | Burn your own AgentToken balance (reduces totalSupply). |
| `transfer_tokens` | Transfer any ERC-20 (AgentToken, USDC, WPHRS, . |
| `renounce_minting` | PERMANENTLY disable minting on an AgentToken you own — fixes supply forever. |
| `wrap_native` | Wrap native PHRS into WPHRS (canonical wrapped token) via deposit(). |
| `unwrap_native` | Unwrap WPHRS back to native PHRS via withdraw(amount). |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-token-launcher": { "command": "node", "args": ["pharos-token-launcher/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

AgentToken (original, bytecode ships with skill; deployed per-use) — Solidity source in [`contracts/`](contracts/), original and dependency-free.

## Live proof on Atlantic testnet

- `deploy_token` → [`0xc9367cb8718bbaee…`](https://atlantic.pharosscan.xyz/tx/0xc9367cb8718bbaeea82a376d4e4e67ec0b3cd0db5c1725792f7d6f64084ac436)
- `mint_tokens` → [`0xf95f3111bb432c3c…`](https://atlantic.pharosscan.xyz/tx/0xf95f3111bb432c3c6096e56849d450c42fdc1785f161ad934423e71d09864379)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
