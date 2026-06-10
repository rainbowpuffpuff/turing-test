// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title StreamPay — per-second native payment streams for working agents
/// @notice A payer opens a stream that vests PHRS/PROS to a recipient continuously.
///         The recipient (e.g. an AI agent performing ongoing work) can withdraw
///         vested funds at any moment; the payer can top-up or cancel (split fairly).
/// @dev    Self-contained, no external imports. Designed as a composable Skill
///         primitive for continuous agent compensation on Pharos.
contract StreamPay {
    struct Stream {
        address payer;
        address recipient;
        uint96  deposit;      // total locked
        uint96  withdrawn;    // amount already withdrawn by recipient
        uint40  start;        // vesting start ts
        uint40  stop;         // vesting end ts
        bool    cancelled;
    }

    uint256 public nextId;
    mapping(uint256 => Stream) public streams;

    event StreamCreated(uint256 indexed id, address indexed payer, address indexed recipient, uint256 deposit, uint40 start, uint40 stop);
    event StreamToppedUp(uint256 indexed id, uint256 amount, uint40 newStop);
    event Withdrawn(uint256 indexed id, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed id, uint256 recipientAmount, uint256 payerAmount);

    error NotPayer();
    error NotRecipient();
    error ZeroAmount();
    error BadTimes();
    error AlreadyCancelled();
    error NothingToWithdraw();
    error TransferFailed();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        require(_lock == 1, "reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Open a stream paying `recipient` from `start` to `stop` (linear vesting).
    ///         Pass start=0 to begin immediately.
    function create(address recipient, uint40 start, uint40 stop) external payable returns (uint256 id) {
        if (msg.value == 0) revert ZeroAmount();
        if (recipient == address(0)) revert BadTimes();
        uint40 s = start == 0 ? uint40(block.timestamp) : start;
        if (stop <= s) revert BadTimes();
        id = nextId++;
        streams[id] = Stream({
            payer: msg.sender,
            recipient: recipient,
            deposit: uint96(msg.value),
            withdrawn: 0,
            start: s,
            stop: stop,
            cancelled: false
        });
        emit StreamCreated(id, msg.sender, recipient, msg.value, s, stop);
    }

    /// @notice Vested amount for the recipient at time `t` (clamped to [start, stop]).
    function vestedAt(uint256 id, uint256 t) public view returns (uint256) {
        Stream storage s = streams[id];
        if (t <= s.start) return 0;
        if (t >= s.stop) return s.deposit;
        return (uint256(s.deposit) * (t - s.start)) / (s.stop - s.start);
    }

    /// @notice Currently withdrawable by the recipient.
    function withdrawable(uint256 id) public view returns (uint256) {
        Stream storage s = streams[id];
        if (s.cancelled) return 0;
        return vestedAt(id, block.timestamp) - s.withdrawn;
    }

    /// @notice Recipient pulls vested funds.
    function withdraw(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (msg.sender != s.recipient) revert NotRecipient();
        if (s.cancelled) revert AlreadyCancelled();
        uint256 amt = vestedAt(id, block.timestamp) - s.withdrawn;
        if (amt == 0) revert NothingToWithdraw();
        s.withdrawn += uint96(amt);
        (bool ok, ) = s.recipient.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(id, s.recipient, amt);
    }

    /// @notice Payer extends the stream by adding funds; vesting rate stays constant,
    ///         so added deposit linearly extends the stop time.
    function topUp(uint256 id) external payable {
        Stream storage s = streams[id];
        if (msg.sender != s.payer) revert NotPayer();
        if (s.cancelled) revert AlreadyCancelled();
        if (msg.value == 0) revert ZeroAmount();
        // rate = deposit / (stop - start); extension = value / rate
        uint256 rateNum = uint256(s.deposit);
        uint256 rateDen = uint256(s.stop - s.start);
        uint256 extension = (msg.value * rateDen) / rateNum;
        s.deposit += uint96(msg.value);
        s.stop += uint40(extension);
        emit StreamToppedUp(id, msg.value, s.stop);
    }

    /// @notice Either party cancels: recipient gets vested-so-far, payer gets the rest.
    function cancel(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (msg.sender != s.payer && msg.sender != s.recipient) revert NotPayer();
        if (s.cancelled) revert AlreadyCancelled();
        s.cancelled = true;
        uint256 vested = vestedAt(id, block.timestamp);
        uint256 toRecipient = vested - s.withdrawn;
        uint256 toPayer = uint256(s.deposit) - vested;
        s.withdrawn = uint96(vested);
        if (toRecipient > 0) {
            (bool ok1, ) = s.recipient.call{value: toRecipient}("");
            if (!ok1) revert TransferFailed();
        }
        if (toPayer > 0) {
            (bool ok2, ) = s.payer.call{value: toPayer}("");
            if (!ok2) revert TransferFailed();
        }
        emit Cancelled(id, toRecipient, toPayer);
    }

    function get(uint256 id) external view returns (Stream memory) {
        return streams[id];
    }
}
