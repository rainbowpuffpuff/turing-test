# Pharos Invoice Book — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `create_invoice`

Issue an on-chain invoice. asset: "native" | symbol (USDC/USDT/WPHRS) | 0x token address. payer optional (restricts who may pay). amount in human units. memo: short reference like "INV-2026-001". memoContent: full invoice doc — hashed on-chain.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | string | yes |  |
| `asset` | string | no | default "native" |
| `payer` | string | no | optional restricted payer |
| `dueInDays` | number | no | informational due date (default 7) |
| `memo` | string | yes | short reference, stored on-chain |
| `memoContent` | string | no | full invoice document (line items etc.) — only its keccak hash goes on-chain |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `pay_invoice`

Pay an invoice (full or partial). For ERC-20 invoices this auto-approves the InvoiceBook contract if allowance is insufficient. amount optional — defaults to the full remaining balance.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `invoiceId` | integer | yes |  |
| `amount` | string | no | human units; omit to pay remaining in full |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `invoice_status`

Read full invoice state + on-chain payment history (scanned from InvoicePaid logs).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `invoiceId` | integer | yes |  |
| `historyBlocks` | integer | no | how many recent blocks to scan for payments (default 200000) |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `cancel_invoice`

Cancel an invoice you issued (only unpaid/partially-paid can be cancelled; received funds are kept — they were forwarded on payment).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `invoiceId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `list_my_invoices`

List invoices issued by an address (scans InvoiceCreated logs over recent blocks).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `issuer` | string | no | defaults to PHAROS_PRIVATE_KEY address |
| `historyBlocks` | integer | no | default 200000 |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

