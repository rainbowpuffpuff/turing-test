// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AgentRegistry — on-chain identity & capability registry for AI agents
/// @notice Agents register a profile (name, metadata URI, service endpoint) and
///         declare capabilities ("skills" they can perform). Peers attest to an
///         agent's capabilities, building a web-of-trust reputation layer that
///         other agents can query before hiring/transacting.
/// @dev    Self-contained. The social/identity primitive of the Pharos agent economy.
contract AgentRegistry {
    struct AgentProfile {
        address owner;        // controlling wallet
        string  name;         // unique handle, e.g. "trade-helper-7"
        string  metadataURI;  // off-chain JSON (avatar, description, pricing)
        string  endpoint;     // service endpoint descriptor (e.g. MCP/HTTP URI)
        uint40  registeredAt;
        uint40  updatedAt;
        bool    active;
    }

    mapping(address => AgentProfile) public agents;       // owner => profile
    mapping(bytes32 => address) public nameOwner;          // keccak(name) => owner
    mapping(address => bytes32[]) private _capabilities;   // owner => capability tags
    mapping(address => mapping(bytes32 => bool)) public hasCapability;
    // attestations[subject][capability][attester] = true
    mapping(address => mapping(bytes32 => mapping(address => bool))) public attested;
    mapping(address => mapping(bytes32 => uint256)) public attestationCount;

    event AgentRegistered(address indexed owner, string name, string endpoint);
    event AgentUpdated(address indexed owner, string metadataURI, string endpoint, bool active);
    event CapabilityDeclared(address indexed owner, bytes32 indexed capability, string label);
    event CapabilityRevoked(address indexed owner, bytes32 indexed capability);
    event Attested(address indexed subject, bytes32 indexed capability, address indexed attester);
    event AttestationRevoked(address indexed subject, bytes32 indexed capability, address indexed attester);

    error NameTaken();
    error NotRegistered();
    error AlreadyRegistered();
    error EmptyName();
    error SelfAttestation();
    error CapabilityUnknown();

    /// @notice Register the caller as an agent with a unique name.
    function register(string calldata name, string calldata metadataURI, string calldata endpoint) external {
        if (bytes(name).length == 0 || bytes(name).length > 64) revert EmptyName();
        if (agents[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        bytes32 key = keccak256(bytes(name));
        if (nameOwner[key] != address(0)) revert NameTaken();
        nameOwner[key] = msg.sender;
        agents[msg.sender] = AgentProfile({
            owner: msg.sender,
            name: name,
            metadataURI: metadataURI,
            endpoint: endpoint,
            registeredAt: uint40(block.timestamp),
            updatedAt: uint40(block.timestamp),
            active: true
        });
        emit AgentRegistered(msg.sender, name, endpoint);
    }

    /// @notice Update mutable profile fields.
    function update(string calldata metadataURI, string calldata endpoint, bool active) external {
        AgentProfile storage p = agents[msg.sender];
        if (p.registeredAt == 0) revert NotRegistered();
        p.metadataURI = metadataURI;
        p.endpoint = endpoint;
        p.active = active;
        p.updatedAt = uint40(block.timestamp);
        emit AgentUpdated(msg.sender, metadataURI, endpoint, active);
    }

    /// @notice Declare a capability tag (e.g. "swap-execution", "audit-solidity").
    /// @param label human-readable label; stored hashed, label only in the event log.
    function declareCapability(string calldata label) external {
        if (agents[msg.sender].registeredAt == 0) revert NotRegistered();
        bytes32 cap = keccak256(bytes(label));
        if (!hasCapability[msg.sender][cap]) {
            hasCapability[msg.sender][cap] = true;
            _capabilities[msg.sender].push(cap);
        }
        emit CapabilityDeclared(msg.sender, cap, label);
    }

    /// @notice Revoke a previously declared capability.
    function revokeCapability(string calldata label) external {
        bytes32 cap = keccak256(bytes(label));
        if (!hasCapability[msg.sender][cap]) revert CapabilityUnknown();
        hasCapability[msg.sender][cap] = false;
        emit CapabilityRevoked(msg.sender, cap);
    }

    /// @notice Attest that `subject` competently performs `label`. One vote per attester.
    function attest(address subject, string calldata label) external {
        if (subject == msg.sender) revert SelfAttestation();
        if (agents[subject].registeredAt == 0) revert NotRegistered();
        bytes32 cap = keccak256(bytes(label));
        if (!hasCapability[subject][cap]) revert CapabilityUnknown();
        if (!attested[subject][cap][msg.sender]) {
            attested[subject][cap][msg.sender] = true;
            attestationCount[subject][cap] += 1;
            emit Attested(subject, cap, msg.sender);
        }
    }

    /// @notice Withdraw an attestation.
    function revokeAttestation(address subject, string calldata label) external {
        bytes32 cap = keccak256(bytes(label));
        if (attested[subject][cap][msg.sender]) {
            attested[subject][cap][msg.sender] = false;
            attestationCount[subject][cap] -= 1;
            emit AttestationRevoked(subject, cap, msg.sender);
        }
    }

    // ---------- views ----------

    function getProfile(address owner) external view returns (AgentProfile memory) {
        return agents[owner];
    }

    function resolveName(string calldata name) external view returns (address) {
        return nameOwner[keccak256(bytes(name))];
    }

    function capabilitiesOf(address owner) external view returns (bytes32[] memory) {
        return _capabilities[owner];
    }

    /// @notice Endorsement count for (subject, capability label).
    function endorsements(address subject, string calldata label) external view returns (uint256) {
        return attestationCount[subject][keccak256(bytes(label))];
    }
}
