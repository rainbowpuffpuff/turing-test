// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AgentToken — minimal, auditable ERC-20 for agent-issued economies
/// @notice Deployed by the pharos-token-launcher skill. Owner (the issuing agent)
///         can mint up to a hard cap and renounce minting forever. Standard
///         ERC-20 + EIP-2612 permit for gasless approvals.
contract AgentToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    uint256 public immutable cap;          // 0 = uncapped
    address public owner;
    bool public mintingRenounced;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MintingRenounced();

    error NotOwner();
    error CapExceeded();
    error MintingDisabled();
    error InsufficientBalance();
    error InsufficientAllowance();
    error PermitExpired();
    error InvalidSignature();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _cap, uint256 initialMint, address _owner) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        cap = _cap;
        owner = _owner;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(_name)),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
        if (initialMint > 0) {
            if (_cap != 0 && initialMint > _cap) revert CapExceeded();
            totalSupply = initialMint;
            balanceOf[_owner] = initialMint;
            emit Transfer(address(0), _owner, initialMint);
        }
        emit OwnershipTransferred(address(0), _owner);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        return _transfer(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - value;
        }
        return _transfer(from, to, value);
    }

    function _transfer(address from, address to, uint256 value) internal returns (bool) {
        if (balanceOf[from] < value) revert InsufficientBalance();
        unchecked { balanceOf[from] -= value; balanceOf[to] += value; }
        emit Transfer(from, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /// @notice EIP-2612 gasless approval.
    function permit(address _owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        if (block.timestamp > deadline) revert PermitExpired();
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(PERMIT_TYPEHASH, _owner, spender, value, nonces[_owner]++, deadline))
        ));
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != _owner) revert InvalidSignature();
        allowance[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    /// @notice Owner mints new supply (respecting cap, unless renounced).
    function mint(address to, uint256 value) external onlyOwner {
        if (mintingRenounced) revert MintingDisabled();
        if (cap != 0 && totalSupply + value > cap) revert CapExceeded();
        totalSupply += value;
        unchecked { balanceOf[to] += value; }
        emit Transfer(address(0), to, value);
    }

    /// @notice Burn your own tokens.
    function burn(uint256 value) external {
        if (balanceOf[msg.sender] < value) revert InsufficientBalance();
        unchecked { balanceOf[msg.sender] -= value; totalSupply -= value; }
        emit Transfer(msg.sender, address(0), value);
    }

    /// @notice Permanently disable minting (supply becomes fixed).
    function renounceMinting() external onlyOwner {
        mintingRenounced = true;
        emit MintingRenounced();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
