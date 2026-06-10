# Pharos Chain Sentinel — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `watch_address`

Snapshot an address (balance, nonce, code?) and scan recent blocks for its activity (sent txs detected via nonce delta, received value via Transfer logs). Pass the previous result's `cursor` to get a diff since last check.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | string | yes |  |
| `cursor` | object | no | previous {block, balance, nonce} to diff against |
| `scanBlocks` | integer | no | Transfer-log lookback when no cursor (default 5000) |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `watch_events`

Scan a contract for events. Knows common signatures (ERC-20 Transfer/Approval, WPHRS Deposit/Withdrawal, PharosKit EscrowCreated/StreamCreated/InvoiceCreated/AgentRegistered) and labels them; unknown topics are returned raw. Custom signature supported via eventSignature.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `contract` | string | yes |  |
| `eventSignature` | string | no | e.g. "Transfer(address,address,uint256)" — filters to this event |
| `fromBlock` | integer | no | default latest-5000 |
| `toBlock` | integer | no | default latest |
| `maxResults` | integer | no | default 50 |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `balance_watch`

Snapshot native + token balances for up to 10 addresses, with optional low/high thresholds that produce alerts. Token list defaults to the canonical registry (USDC, USDT, WPHRS, ...).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `addresses` | array | yes |  |
| `tokens` | array | no | symbols or 0x addresses; default = canonical registry |
| `minNative` | string | no | alert if native balance below this |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `tx_inspect`

Deep-inspect a transaction: status, from/to, value, gas economics (Pharos charges gas_limit!), decoded function selector, token transfers, and event count.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `txHash` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `chain_pulse`

Network health snapshot: latest block, observed block interval, base fee, gas price, and chain id sanity check. Use before batches of transactions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `decode_calldata`

Best-effort decode of transaction calldata: identifies the function from a built-in selector table (ERC-20, WPHRS, Multicall3, ERC-4337 SimpleAccount, PharosKit) and decodes arguments for the common cases.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `calldata` | string | yes |  |

