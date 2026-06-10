# Pharos Token Launcher — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `deploy_token`

Deploy a new AgentToken ERC-20. cap=0 means uncapped. initialMint goes to the owner (your wallet). Source: contracts/AgentToken.sol (MIT, EIP-2612 permit included).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `symbol` | string | yes |  |
| `decimals` | integer | no | default 18 |
| `cap` | string | no | max supply in human units; "0" = uncapped |
| `initialMint` | string | no | minted to you at deploy (default "0") |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `token_info`

Read any ERC-20: name, symbol, decimals, totalSupply, plus AgentToken extras (cap, owner, mintingRenounced) when available. Optionally check balances for given addresses.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes |  |
| `balancesOf` | array | no |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `mint_tokens`

Mint new supply of an AgentToken you own, to any recipient (cap-respecting).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes |  |
| `to` | string | yes |  |
| `amount` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `burn_tokens`

Burn your own AgentToken balance (reduces totalSupply).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes |  |
| `amount` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `transfer_tokens`

Transfer any ERC-20 (AgentToken, USDC, WPHRS, ...) by address or known symbol.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes | 0x address or symbol (USDC, WPHRS, ...) |
| `to` | string | yes |  |
| `amount` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `renounce_minting`

PERMANENTLY disable minting on an AgentToken you own — fixes supply forever. Irreversible; requires confirm:true.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes |  |
| `confirm` | boolean | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `wrap_native`

Wrap native PHRS into WPHRS (canonical wrapped token) via deposit(). Makes native value ERC-20-composable.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `unwrap_native`

Unwrap WPHRS back to native PHRS via withdraw(amount).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

