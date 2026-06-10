// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title InvoiceBook — on-chain invoices for the agent economy (RealFi primitive)
/// @notice Agents and businesses issue invoices payable in native PHRS/PROS or any
///         ERC-20 (e.g. USDC). Supports partial payments, due dates, memo hashes,
///         cancellation, and payer-restricted invoices. Every state change emits an
///         event so agent accounting systems can index reliably.
/// @dev    Minimal ERC-20 interface inlined; no external imports.
contract InvoiceBook {
    enum Status { Unpaid, PartiallyPaid, Paid, Cancelled }

    struct Invoice {
        address issuer;     // who gets paid
        address payer;      // restricted payer, or 0x0 = anyone may pay
        address token;      // 0x0 = native, else ERC-20 address
        uint96  amount;     // total due
        uint96  paid;       // cumulative paid
        uint40  dueDate;    // informational deadline (0 = none)
        Status  status;
        bytes32 memoHash;   // keccak256 of off-chain invoice doc (line items etc.)
        string  memo;  // short human/agent-readable reference, e.g. "INV-2026-001"
    }

    uint256 public nextId;
    mapping(uint256 => Invoice) public invoices;

    event InvoiceCreated(uint256 indexed id, address indexed issuer, address indexed payer, address token, uint256 amount, uint40 dueDate, bytes32 memoHash, string memo);
    event InvoicePaid(uint256 indexed id, address indexed payer, uint256 amount, uint256 totalPaid, bool settled);
    event InvoiceCancelled(uint256 indexed id);

    error NotIssuer();
    error WrongPayer();
    error WrongToken();
    error ZeroAmount();
    error Overpay();
    error BadStatus();
    error TransferFailed();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Issue an invoice. token=0x0 → native currency; payer=0x0 → open invoice.
    function create(address payer, address token, uint96 amount, uint40 dueDate, bytes32 memoHash, string calldata memo)
        external returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        id = nextId++;
        invoices[id] = Invoice({
            issuer: msg.sender,
            payer: payer,
            token: token,
            amount: amount,
            paid: 0,
            dueDate: dueDate,
            status: Status.Unpaid,
            memoHash: memoHash,
            memo: memo
        });
        emit InvoiceCreated(id, msg.sender, payer, token, amount, dueDate, memoHash, memo);
    }

    /// @notice Pay a native-currency invoice (full or partial via msg.value).
    function payNative(uint256 id) external payable nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.status == Status.Paid || inv.status == Status.Cancelled) revert BadStatus();
        if (inv.token != address(0)) revert WrongToken();
        if (inv.payer != address(0) && msg.sender != inv.payer) revert WrongPayer();
        if (msg.value == 0) revert ZeroAmount();
        if (inv.paid + msg.value > inv.amount) revert Overpay();
        inv.paid += uint96(msg.value);
        bool settled = inv.paid == inv.amount;
        inv.status = settled ? Status.Paid : Status.PartiallyPaid;
        (bool ok, ) = inv.issuer.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit InvoicePaid(id, msg.sender, msg.value, inv.paid, settled);
    }

    /// @notice Pay an ERC-20 invoice. Payer must approve this contract first.
    function payToken(uint256 id, uint96 amount) external nonReentrant {
        Invoice storage inv = invoices[id];
        if (inv.status == Status.Paid || inv.status == Status.Cancelled) revert BadStatus();
        if (inv.token == address(0)) revert WrongToken();
        if (inv.payer != address(0) && msg.sender != inv.payer) revert WrongPayer();
        if (amount == 0) revert ZeroAmount();
        if (inv.paid + amount > inv.amount) revert Overpay();
        inv.paid += amount;
        bool settled = inv.paid == inv.amount;
        inv.status = settled ? Status.Paid : Status.PartiallyPaid;
        bool ok = interface20(inv.token).transferFrom(msg.sender, inv.issuer, amount);
        if (!ok) revert TransferFailed();
        emit InvoicePaid(id, msg.sender, amount, inv.paid, settled);
    }

    /// @notice Issuer cancels an unpaid/partially-paid invoice (no refunds needed —
    ///         funds always forward directly to the issuer on payment).
    function cancel(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (msg.sender != inv.issuer) revert NotIssuer();
        if (inv.status == Status.Paid || inv.status == Status.Cancelled) revert BadStatus();
        inv.status = Status.Cancelled;
        emit InvoiceCancelled(id);
    }

    function get(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    /// @notice Remaining amount due on an invoice.
    function remaining(uint256 id) external view returns (uint256) {
        Invoice storage inv = invoices[id];
        if (inv.status == Status.Cancelled) return 0;
        return inv.amount - inv.paid;
    }
}

/// @dev Minimal ERC-20 surface used by InvoiceBook.
interface interface20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
