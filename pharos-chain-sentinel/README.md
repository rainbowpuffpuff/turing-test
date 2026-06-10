<div align="center">

# Pharos Chain Sentinel

**The eyes of every Pharos agent: watch addresses, decode events, monitor balances — with diff cursors.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

Read-only chain monitoring built for agent loops: snapshot any address and diff against a cursor from the previous check (balance deltas, new txs, token flows), scan contracts for events with built-in decoding of common signatures (ERC-20, WPHRS, ERC-4337, and the PharosKit contracts), multi-address balance watch with threshold alerts, deep transaction inspection (including Pharos's charge-gas_limit quirk), network health pulse, and calldata decoding. No private key required.

## Why agents need it

Every autonomous agent needs reliable, structured observation of chain state to act on. This skill is that observation layer, designed for agent polling loops.

## Tools

| Tool | Purpose |
|------|---------|
| `watch_address` | Snapshot an address (balance, nonce, code?) and scan recent blocks for its activity (sent txs detected via nonce delta, received value via Transfer logs). |
| `watch_events` | Scan a contract for events. |
| `balance_watch` | Snapshot native + token balances for up to 10 addresses, with optional low/high thresholds that produce alerts. |
| `tx_inspect` | Deep-inspect a transaction: status, from/to, value, gas economics (Pharos charges gas_limit!), decoded function selector, token transfers, and event count. |
| `chain_pulse` | Network health snapshot: latest block, observed block interval, base fee, gas price, and chain id sanity check. |
| `decode_calldata` | Best-effort decode of transaction calldata: identifies the function from a built-in selector table (ERC-20, WPHRS, Multicall3, ERC-4337 SimpleAccount, PharosKit) and decodes arguments for the common cases. |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-chain-sentinel": { "command": "node", "args": ["pharos-chain-sentinel/src/server.mjs"] } } }
```


## Live proof on Atlantic testnet

- `tx_inspect(escrow release)` → [`0xdedd5d10d833fe5a…`](https://atlantic.pharosscan.xyz/tx/0xdedd5d10d833fe5ac8a70c03b6d66841f5427e62bca0320cba9632e2dec1b688)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Read-only by design — no private key ever needed.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
