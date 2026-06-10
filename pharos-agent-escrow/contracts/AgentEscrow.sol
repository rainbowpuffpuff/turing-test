// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AgentEscrow — trustless escrow for agent-to-agent service commerce
/// @notice A client (human or AI agent) locks payment for a task. A worker agent
///         accepts, delivers, and gets paid on release. Includes a dispute window,
///         deadline-based refunds, and delivery-proof anchoring (hash of work).
/// @dev    Self-contained: no external imports. Native PHRS payments.
///         Designed as a composable "Skill" primitive for the Pharos agent economy.
contract AgentEscrow {
    enum Status { Open, Accepted, Delivered, Released, Refunded, Disputed }

    struct Escrow {
        address client;        // who pays
        address worker;        // who performs (0x0 = open to anyone)
        uint96  amount;        // locked native amount
        uint40  deadline;      // unix ts — worker must deliver before this
        uint40  disputeWindow; // seconds after delivery during which client can dispute
        uint40  deliveredAt;   // set on delivery
        Status  status;
        bytes32 taskHash;      // keccak256 of task spec (off-chain JSON)
        bytes32 deliveryHash;  // keccak256 of delivery artifact
    }

    uint256 public nextId;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(uint256 indexed id, address indexed client, address indexed worker, uint256 amount, uint40 deadline, bytes32 taskHash);
    event EscrowAccepted(uint256 indexed id, address indexed worker);
    event Delivered(uint256 indexed id, bytes32 deliveryHash);
    event Released(uint256 indexed id, address indexed worker, uint256 amount);
    event Refunded(uint256 indexed id, address indexed client, uint256 amount);
    event DisputeOpened(uint256 indexed id);
    event DisputeResolved(uint256 indexed id, uint256 workerShareBps);

    error NotClient();
    error NotWorker();
    error BadStatus();
    error ZeroAmount();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error DisputeWindowOpen();
    error DisputeWindowClosed();
    error TransferFailed();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Create and fund an escrow. `worker` may be address(0) for an open task.
    /// @param worker        designated worker, or 0x0 to allow any agent to accept
    /// @param deadline      unix timestamp by which delivery must happen
    /// @param disputeWindow seconds after delivery during which the client may dispute
    /// @param taskHash      keccak256 hash of the off-chain task specification
    function create(address worker, uint40 deadline, uint40 disputeWindow, bytes32 taskHash)
        external payable returns (uint256 id)
    {
        if (msg.value == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlinePassed();
        id = nextId++;
        escrows[id] = Escrow({
            client: msg.sender,
            worker: worker,
            amount: uint96(msg.value),
            deadline: deadline,
            disputeWindow: disputeWindow,
            deliveredAt: 0,
            status: worker == address(0) ? Status.Open : Status.Accepted,
            taskHash: taskHash,
            deliveryHash: bytes32(0)
        });
        emit EscrowCreated(id, msg.sender, worker, msg.value, deadline, taskHash);
        if (worker != address(0)) emit EscrowAccepted(id, worker);
    }

    /// @notice Accept an open task (becomes the designated worker).
    function accept(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Open) revert BadStatus();
        if (block.timestamp >= e.deadline) revert DeadlinePassed();
        e.worker = msg.sender;
        e.status = Status.Accepted;
        emit EscrowAccepted(id, msg.sender);
    }

    /// @notice Worker anchors delivery proof (hash of the artifact) before deadline.
    function deliver(uint256 id, bytes32 deliveryHash) external {
        Escrow storage e = escrows[id];
        if (msg.sender != e.worker) revert NotWorker();
        if (e.status != Status.Accepted) revert BadStatus();
        if (block.timestamp >= e.deadline) revert DeadlinePassed();
        e.deliveryHash = deliveryHash;
        e.deliveredAt = uint40(block.timestamp);
        e.status = Status.Delivered;
        emit Delivered(id, deliveryHash);
    }

    /// @notice Client releases payment to worker (any time after delivery, or even before).
    function release(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (msg.sender != e.client) revert NotClient();
        if (e.status != Status.Delivered && e.status != Status.Accepted) revert BadStatus();
        e.status = Status.Released;
        uint256 amt = e.amount;
        e.amount = 0;
        (bool ok, ) = e.worker.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Released(id, e.worker, amt);
    }

    /// @notice Worker self-claims after the dispute window elapses without dispute.
    function claimAfterWindow(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (msg.sender != e.worker) revert NotWorker();
        if (e.status != Status.Delivered) revert BadStatus();
        if (block.timestamp <= uint256(e.deliveredAt) + e.disputeWindow) revert DisputeWindowOpen();
        e.status = Status.Released;
        uint256 amt = e.amount;
        e.amount = 0;
        (bool ok, ) = e.worker.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Released(id, e.worker, amt);
    }

    /// @notice Client reclaims funds if nothing was delivered by the deadline,
    ///         or cancels an unaccepted open task at any time.
    function refund(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (msg.sender != e.client) revert NotClient();
        bool unaccepted = e.status == Status.Open;
        bool expired = e.status == Status.Accepted && block.timestamp >= e.deadline;
        if (!unaccepted && !expired) revert BadStatus();
        e.status = Status.Refunded;
        uint256 amt = e.amount;
        e.amount = 0;
        (bool ok, ) = e.client.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Refunded(id, e.client, amt);
    }

    /// @notice Client opens a dispute during the dispute window after delivery.
    function dispute(uint256 id) external {
        Escrow storage e = escrows[id];
        if (msg.sender != e.client) revert NotClient();
        if (e.status != Status.Delivered) revert BadStatus();
        if (block.timestamp > uint256(e.deliveredAt) + e.disputeWindow) revert DisputeWindowClosed();
        e.status = Status.Disputed;
        emit DisputeOpened(id);
    }

    /// @notice Mutual resolution of a dispute: both parties sign off on a split.
    ///         Either party proposes; the counterparty accepts by calling with the
    ///         same `workerShareBps`. Minimal two-step handshake stored in transient map.
    mapping(uint256 => mapping(address => uint256)) public resolutionProposals; // id => proposer => bps+1

    function proposeResolution(uint256 id, uint256 workerShareBps) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Disputed) revert BadStatus();
        if (msg.sender != e.client && msg.sender != e.worker) revert NotClient();
        require(workerShareBps <= 10000, "bps>10000");
        resolutionProposals[id][msg.sender] = workerShareBps + 1; // +1 so 0 bps is distinguishable

        address other = msg.sender == e.client ? e.worker : e.client;
        if (resolutionProposals[id][other] == workerShareBps + 1) {
            // both agree — settle
            e.status = Status.Released;
            uint256 amt = e.amount;
            e.amount = 0;
            uint256 workerAmt = (amt * workerShareBps) / 10000;
            uint256 clientAmt = amt - workerAmt;
            if (workerAmt > 0) {
                (bool ok1, ) = e.worker.call{value: workerAmt}("");
                if (!ok1) revert TransferFailed();
            }
            if (clientAmt > 0) {
                (bool ok2, ) = e.client.call{value: clientAmt}("");
                if (!ok2) revert TransferFailed();
            }
            emit DisputeResolved(id, workerShareBps);
        }
    }

    /// @notice Convenience getter returning the full escrow struct.
    function get(uint256 id) external view returns (Escrow memory) {
        return escrows[id];
    }
}
