<div align="center">

# Pharos Agent Registry

**On-chain identity for AI agents: unique names, capabilities, peer attestations.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

An original AgentRegistry contract on Pharos Atlantic testnet gives agents discoverable on-chain identities: register a unique name with metadata URI and service endpoint, declare capability tags ('swap-execution', 'solidity-audit'), and earn attestations from peers — one per attester per capability — building a web-of-trust reputation other agents query before delegating work or funds. The social/discovery layer of the Pharos agent economy.

## Why agents need it

Before agents can hire each other they must find and trust each other. This skill gives every agent a discoverable on-chain identity and a peer-attested reputation.

## Tools

| Tool | Purpose |
|------|---------|
| `register_agent` | Register the caller (PHAROS_PRIVATE_KEY address) as an agent with a globally unique name. |
| `update_profile` | Update your agent profile fields (metadataURI, endpoint, active status). |
| `declare_capability` | Declare a capability your agent performs, e. |
| `attest_capability` | Endorse another agent: attest that `subject` competently performs `label`. |
| `lookup_agent` | Look up an agent by unique name OR wallet address. |
| `check_reputation` | Get endorsement counts for an agent across given capability labels. |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-agent-registry": { "command": "node", "args": ["pharos-agent-registry/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

AgentRegistry 0x204ec9f83a804672121d946d3da7f66b5c7b2cc3 (original, deployed on Atlantic testnet) — Solidity source in [`contracts/`](contracts/), original and dependency-free.

## Live proof on Atlantic testnet

- `register_agent` → [`0x1145510d4c5b94c3…`](https://atlantic.pharosscan.xyz/tx/0x1145510d4c5b94c30bda71901f77b65684e2a456ebedd74aa9e7532306c4a90d)
- `declare_capability:x402-payments` → [`0x0e091b7808c2c190…`](https://atlantic.pharosscan.xyz/tx/0x0e091b7808c2c190a2f99e086feb047216ac111d747986d37ed806d425653ab3)
- `declare_capability:escrow-commerce` → [`0x470ec85ac1d7c106…`](https://atlantic.pharosscan.xyz/tx/0x470ec85ac1d7c106385b056ea6407029cc18576c8195f5f87abe3e3cf4fce808)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
