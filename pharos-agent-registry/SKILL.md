---
name: pharos-agent-registry
description: >
  On-chain identity for AI agents: unique names, capabilities, peer attestations. Invoke this skill whenever the user or agent mentions: agent identity, register agent, agent name, reputation, attestation, endorse, find agent, trust, capability discovery.
  An original AgentRegistry contract on Pharos Atlantic testnet gives agents discoverable on-chain identities: register a unique name with metadata URI and service endpoint, declare capability tags ('swap-execution', 'solidity-audit'), and earn attestations from peers — one per attester per capability — building a web-of-trust reputation other agents query before delegating work or funds. The social/discovery layer of the Pharos agent economy.. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Write operations sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, agent-identity]
license: MIT
---

# Pharos Agent Registry

An original AgentRegistry contract on Pharos Atlantic testnet gives agents discoverable on-chain identities: register a unique name with metadata URI and service endpoint, declare capability tags ('swap-execution', 'solidity-audit'), and earn attestations from peers — one per attester per capability — building a web-of-trust reputation other agents query before delegating work or funds. The social/discovery layer of the Pharos agent economy.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-agent-registry": {
      "command": "node",
      "args": ["pharos-agent-registry/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `register_agent` | Register the caller (PHAROS_PRIVATE_KEY address) as an agent with a globally unique name. |
| `update_profile` | Update your agent profile fields (metadataURI, endpoint, active status). |
| `declare_capability` | Declare a capability your agent performs, e. |
| `attest_capability` | Endorse another agent: attest that `subject` competently performs `label`. |
| `lookup_agent` | Look up an agent by unique name OR wallet address. |
| `check_reputation` | Get endorsement counts for an agent across given capability labels. |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **AgentRegistry 0x204ec9f83a804672121d946d3da7f66b5c7b2cc3 (original, deployed on Atlantic testnet)**.

Solidity source ships in `contracts/` — original, dependency-free, MIT-licensed. Deployment addresses live in `assets/deployments.json` and can be overridden via environment variable (see `references/tools.md`).
## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PHAROS_PRIVATE_KEY` | for write ops | signs transactions locally; never logged or transmitted |
| `PHAROS_RPC_URL` | no | override the default RPC endpoint |
| `PHAROS_NETWORK` | no | default network (`atlantic-testnet` / `mainnet`) |

## Security Notes

- **Zero runtime dependencies** — no npm install, no supply-chain surface. Crypto primitives are vendored builds of audited `@noble/secp256k1` + `@noble/hashes` (in `src/lib/vendor/`, fetched from esm.sh, pinned).
- No shell execution, no filesystem writes (outside explicit user-invoked flows), no telemetry, no external endpoints besides the configured Pharos RPC.
- Private keys sign transactions **locally** (own RLP/EIP-1559 implementation, verified against known-answer test vectors); raw keys never leave the process.
- Pharos gas quirk handled: the chain charges `gas_limit` (not `gas_used`) at inclusion — estimates use a modest +15% buffer and 0 priority fee.
- Destructive/spending operations require explicit parameters (`confirm: true` flags, hard `maxPayment` caps) — the agent cannot overspend by accident.

## Composability

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-agent-escrow`, `pharos-x402-merchant`, `pharos-chain-sentinel`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `register_agent` → [`0x1145510d4c5b94c3…`](https://atlantic.pharosscan.xyz/tx/0x1145510d4c5b94c30bda71901f77b65684e2a456ebedd74aa9e7532306c4a90d)
- `declare_capability:x402-payments` → [`0x0e091b7808c2c190…`](https://atlantic.pharosscan.xyz/tx/0x0e091b7808c2c190a2f99e086feb047216ac111d747986d37ed806d425653ab3)
- `declare_capability:escrow-commerce` → [`0x470ec85ac1d7c106…`](https://atlantic.pharosscan.xyz/tx/0x470ec85ac1d7c106385b056ea6407029cc18576c8195f5f87abe3e3cf4fce808)

## File Tree

```
pharos-agent-registry/
├── SKILL.md                 # this manifest (Anvita Flow / pharos-skill-engine format)
├── src/
│   ├── server.mjs           # MCP server (stdio) — all tools
│   └── lib/                 # zero-dependency runtime (EVM codec, signer, MCP, Pharos nets)
├── assets/
│   ├── networks.json        # canonical network config
│   └── deployments.json      # deployed contract addresses
├── contracts/               # original Solidity source (MIT)
├── references/
│   └── tools.md             # full per-tool parameter schemas
├── test/
│   └── smoke.mjs            # protocol + tool smoke test
└── README.md
```
