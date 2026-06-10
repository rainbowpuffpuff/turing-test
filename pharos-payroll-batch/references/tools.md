# Pharos Payroll Batch — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `parse_recipients`

Validate and normalize a recipient list. Input: CSV lines "address,amount" or JSON [{address, amount}]. Returns valid rows, per-row errors, and duplicate warnings — no chain interaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `list` | string | yes |  |

## `dry_run`

Full payroll preflight WITHOUT sending: validates list, sums totals, checks payer balance (native or token), estimates gas/fees, reports shortfalls. asset: "native" | symbol | 0x address.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `list` | string | yes |  |
| `asset` | string | no | default "native" |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `run_payroll`

EXECUTE the payroll. Requires confirm:true (run dry_run first!). Native: all payouts in ONE Multicall3 aggregate3Value tx. ERC-20: sequential transfers with per-row results. Returns tx hashes and a reconciliation summary.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `list` | string | yes |  |
| `asset` | string | no |  |
| `confirm` | boolean | yes | must be true — explicit execution consent |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `payout_report`

Reconcile a payroll: given tx hash(es), report per-recipient outcomes by decoding receipts and transfer logs. Use after run_payroll for accounting.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `txHashes` | array | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

