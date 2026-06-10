# Pharos Stream Pay — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `quote_stream`

Plan a stream before opening: given total amount and duration, returns the per-second/minute/hour rate and end time. Pure math, no chain interaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | string | yes | total to stream, human units |
| `durationMinutes` | number | yes |  |

## `open_stream`

Open a payment stream: lock `amount` (human units of native PHRS) vesting linearly to `recipient` over `durationMinutes`, starting now.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `recipient` | string | yes |  |
| `amount` | string | yes |  |
| `durationMinutes` | number | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `stream_status`

Live status of a stream: vested so far, withdrawable now, withdrawn, remaining, progress %.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `streamId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `withdraw_vested`

As the stream recipient, withdraw everything vested so far.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `streamId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `top_up`

As the payer, add funds to a live stream — extends its end time at the same vesting rate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `streamId` | integer | yes |  |
| `amount` | string | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `cancel_stream`

Cancel a stream (payer or recipient). Recipient receives vested-so-far; payer gets the remainder back. Fair to-the-second settlement.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `streamId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

