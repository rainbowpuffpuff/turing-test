// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ERC-8004 Trustless Agents — Identity, Reputation & Validation registries
/// @notice Faithful, dependency-free implementation of the ERC-8004 draft used by
///         the Turing Test Hackathon ("every participating AI agent is issued a
///         unique identity NFT via ERC-8004"). Three registries:
///           IdentityRegistry   — ERC-721 (URIStorage-style) agent identity NFTs
///           ReputationRegistry — on-chain feedback signals (giveFeedback)
///           ValidationRegistry — validator request/response hooks (0-100 scores)
/// @dev    Deviation note: the spec suggests proxy-style initialize(); these
///         deployments bind the identity registry in the constructor and expose
///         getIdentityRegistry() per spec. Interfaces otherwise match the draft.

// ─────────────────────────────────────────────────────────── Identity Registry
contract IdentityRegistry {
    string public constant name = "ERC-8004 Trustless Agents";
    string public constant symbol = "AGENT";

    uint256 private _lastId;
    mapping(uint256 => address) private _owner;
    mapping(address => uint256) private _balance;
    mapping(uint256 => address) private _tokenApproval;
    mapping(address => mapping(address => bool)) private _operatorApproval;
    mapping(uint256 => string) private _agentURI;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => address) private _agentWallet;

    bytes32 private constant WALLET_TYPEHASH =
        keccak256("AgentWalletProof(uint256 agentId,address newWallet,uint256 deadline)");
    bytes32 public immutable DOMAIN_SEPARATOR;

    struct MetadataEntry { string metadataKey; bytes metadataValue; }

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
    event AgentURIUpdated(uint256 indexed agentId, string agentURI);

    error NotAuthorized();
    error NonexistentAgent();
    error ReservedKey();
    error BadSignature();
    error Expired();
    error ZeroAddress();
    error UnsafeReceiver();

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("ERC8004IdentityRegistry")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ── ERC-165 ──
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // 165, 721, 721Metadata
    }

    // ── ERC-721 core ──
    function balanceOf(address a) external view returns (uint256) { if (a == address(0)) revert ZeroAddress(); return _balance[a]; }
    function ownerOf(uint256 id) public view returns (address) { address o = _owner[id]; if (o == address(0)) revert NonexistentAgent(); return o; }
    function tokenURI(uint256 id) external view returns (string memory) { ownerOf(id); return _agentURI[id]; }
    function agentURI(uint256 id) external view returns (string memory) { ownerOf(id); return _agentURI[id]; }
    function totalAgents() external view returns (uint256) { return _lastId; }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        if (msg.sender != o && !_operatorApproval[o][msg.sender]) revert NotAuthorized();
        _tokenApproval[id] = to;
        emit Approval(o, to, id);
    }
    function getApproved(uint256 id) public view returns (address) { ownerOf(id); return _tokenApproval[id]; }
    function setApprovalForAll(address op, bool ok) external { _operatorApproval[msg.sender][op] = ok; emit ApprovalForAll(msg.sender, op, ok); }
    function isApprovedForAll(address o, address op) public view returns (bool) { return _operatorApproval[o][op]; }

    function _isAuthorized(address spender, uint256 id) internal view returns (bool) {
        address o = ownerOf(id);
        return spender == o || spender == _tokenApproval[id] || _operatorApproval[o][spender];
    }

    function transferFrom(address from, address to, uint256 id) public {
        if (!_isAuthorized(msg.sender, id)) revert NotAuthorized();
        if (ownerOf(id) != from) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();
        _tokenApproval[id] = address(0);
        unchecked { _balance[from]--; _balance[to]++; }
        _owner[id] = to;
        // spec: agentWallet auto-clears on transfer and must be re-verified
        if (_agentWallet[id] != address(0)) {
            _agentWallet[id] = address(0);
            emit MetadataSet(id, "agentWallet", "agentWallet", abi.encodePacked(address(0)));
        }
        emit Transfer(from, to, id);
    }
    function safeTransferFrom(address from, address to, uint256 id) external { safeTransferFrom(from, to, id, ""); }
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (to.code.length > 0) {
            (bool ok, bytes memory ret) = to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, id, data));
            if (!ok || ret.length < 32 || bytes4(ret) != bytes4(0x150b7a02)) revert UnsafeReceiver();
        }
    }

    // ── ERC-8004 registration ──
    function register() external returns (uint256) { return _register(""); }
    function register(string calldata uri) external returns (uint256) { return _register(uri); }
    function register(string calldata uri, MetadataEntry[] calldata metadata) external returns (uint256 id) {
        id = _register(uri);
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(id, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }
    function _register(string memory uri) internal returns (uint256 id) {
        id = ++_lastId;
        _owner[id] = msg.sender;
        unchecked { _balance[msg.sender]++; }
        _agentURI[id] = uri;
        // reserved agentWallet key initialises to the owner address (per spec)
        _agentWallet[id] = msg.sender;
        emit Transfer(address(0), msg.sender, id);
        emit MetadataSet(id, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));
    }

    function setAgentURI(uint256 id, string calldata uri) external {
        if (!_isAuthorized(msg.sender, id)) revert NotAuthorized();
        _agentURI[id] = uri;
        emit AgentURIUpdated(id, uri);
    }

    // ── on-chain metadata ──
    function getMetadata(uint256 id, string memory key) external view returns (bytes memory) {
        ownerOf(id);
        if (_eq(key, "agentWallet")) return abi.encodePacked(_agentWallet[id]);
        return _metadata[id][key];
    }
    function setMetadata(uint256 id, string memory key, bytes memory value) external {
        if (!_isAuthorized(msg.sender, id)) revert NotAuthorized();
        _setMetadata(id, key, value);
    }
    function _setMetadata(uint256 id, string memory key, bytes memory value) internal {
        if (_eq(key, "agentWallet")) revert ReservedKey();
        _metadata[id][key] = value;
        emit MetadataSet(id, key, key, value);
    }
    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    // ── reserved agentWallet (EIP-712 proof of control; ERC-1271 for contracts) ──
    function getAgentWallet(uint256 id) external view returns (address) { ownerOf(id); return _agentWallet[id]; }
    function unsetAgentWallet(uint256 id) external {
        if (!_isAuthorized(msg.sender, id)) revert NotAuthorized();
        _agentWallet[id] = address(0);
        emit MetadataSet(id, "agentWallet", "agentWallet", abi.encodePacked(address(0)));
    }
    function setAgentWallet(uint256 id, address newWallet, uint256 deadline, bytes calldata signature) external {
        if (!_isAuthorized(msg.sender, id)) revert NotAuthorized();
        if (block.timestamp > deadline) revert Expired();
        if (newWallet == address(0)) revert ZeroAddress();
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(WALLET_TYPEHASH, id, newWallet, deadline))
        ));
        if (newWallet.code.length > 0) {
            // ERC-1271
            (bool ok, bytes memory ret) = newWallet.staticcall(abi.encodeWithSelector(0x1626ba7e, digest, signature));
            if (!ok || ret.length < 32 || bytes4(ret) != bytes4(0x1626ba7e)) revert BadSignature();
        } else {
            if (signature.length != 65) revert BadSignature();
            bytes32 r; bytes32 s; uint8 v;
            assembly {
                r := calldataload(signature.offset)
                s := calldataload(add(signature.offset, 32))
                v := byte(0, calldataload(add(signature.offset, 64)))
            }
            if (ecrecover(digest, v, r, s) != newWallet) revert BadSignature();
        }
        _agentWallet[id] = newWallet;
        emit MetadataSet(id, "agentWallet", "agentWallet", abi.encodePacked(newWallet));
    }

    /// @notice authorization helper used by the sibling registries
    function isOwnerOrOperator(uint256 id, address who) external view returns (bool) {
        address o = ownerOf(id);
        return who == o || who == _tokenApproval[id] || _operatorApproval[o][who];
    }
}

// ───────────────────────────────────────────────────────── Reputation Registry
contract ReputationRegistry {
    IdentityRegistry private immutable _identity;

    struct Feedback { int128 value; uint8 valueDecimals; string tag1; string tag2; bool isRevoked; }

    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _isClient;

    event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
        int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2,
        string endpoint, string feedbackURI, bytes32 feedbackHash);
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
        address indexed responder, string responseURI, bytes32 responseHash);

    error SelfFeedback();
    error BadDecimals();
    error BadIndex();
    error NotClient();

    constructor(address identityRegistry_) { _identity = IdentityRegistry(identityRegistry_); }
    function getIdentityRegistry() external view returns (address) { return address(_identity); }

    function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string calldata tag1,
        string calldata tag2, string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash) external {
        if (valueDecimals > 18) revert BadDecimals();
        // submitter MUST NOT be the agent owner or an approved operator
        if (_identity.isOwnerOrOperator(agentId, msg.sender)) revert SelfFeedback();
        _feedback[agentId][msg.sender].push(Feedback(value, valueDecimals, tag1, tag2, false));
        if (!_isClient[agentId][msg.sender]) { _isClient[agentId][msg.sender] = true; _clients[agentId].push(msg.sender); }
        uint64 idx = uint64(_feedback[agentId][msg.sender].length); // 1-indexed
        emit NewFeedback(agentId, msg.sender, idx, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback[] storage list = _feedback[agentId][msg.sender];
        if (feedbackIndex == 0 || feedbackIndex > list.length) revert BadIndex();
        list[feedbackIndex - 1].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex,
        string calldata responseURI, bytes32 responseHash) external {
        Feedback[] storage list = _feedback[agentId][clientAddress];
        if (feedbackIndex == 0 || feedbackIndex > list.length) revert BadIndex();
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    // ── reads ──
    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked) {
        Feedback[] storage list = _feedback[agentId][clientAddress];
        if (feedbackIndex == 0 || feedbackIndex > list.length) revert BadIndex();
        Feedback storage f = list[feedbackIndex - 1];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return uint64(_feedback[agentId][clientAddress].length);
    }
    function getClients(uint256 agentId) external view returns (address[] memory) { return _clients[agentId]; }

    /// @notice average over non-revoked feedback, optional tag1 filter ("" = all)
    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1)
        external view returns (uint64 count, int128 averageValue) {
        address[] memory who;
        if (clientAddresses.length > 0) who = clientAddresses;
        else who = _clients[agentId];
        bytes32 want = bytes(tag1).length > 0 ? keccak256(bytes(tag1)) : bytes32(0);
        int256 sum;
        for (uint256 i = 0; i < who.length; i++) {
            Feedback[] storage list = _feedback[agentId][who[i]];
            for (uint256 j = 0; j < list.length; j++) {
                Feedback storage f = list[j];
                if (f.isRevoked) continue;
                if (want != bytes32(0) && keccak256(bytes(f.tag1)) != want) continue;
                sum += f.value; count++;
            }
        }
        averageValue = count > 0 ? int128(sum / int256(uint256(count))) : int128(0);
    }
}

// ───────────────────────────────────────────────────────── Validation Registry
contract ValidationRegistry {
    IdentityRegistry private immutable _identity;

    struct Validation {
        address validatorAddress;
        uint256 agentId;
        uint8 response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool exists;
        bool responded;
    }

    mapping(bytes32 => Validation) private _validations;
    mapping(uint256 => bytes32[]) private _agentRequests;
    mapping(address => bytes32[]) private _validatorRequests;

    event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash);
    event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash,
        uint8 response, string responseURI, bytes32 responseHash, string tag);

    error NotAgentOwner();
    error NotValidator();
    error UnknownRequest();
    error DuplicateRequest();
    error BadResponse();

    constructor(address identityRegistry_) { _identity = IdentityRegistry(identityRegistry_); }
    function getIdentityRegistry() external view returns (address) { return address(_identity); }

    function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash) external {
        if (!_identity.isOwnerOrOperator(agentId, msg.sender)) revert NotAgentOwner();
        if (_validations[requestHash].exists) revert DuplicateRequest();
        _validations[requestHash] = Validation(validatorAddress, agentId, 0, bytes32(0), "", block.timestamp, true, false);
        _agentRequests[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);
        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(bytes32 requestHash, uint8 response, string calldata responseURI,
        bytes32 responseHash, string calldata tag) external {
        Validation storage v = _validations[requestHash];
        if (!v.exists) revert UnknownRequest();
        if (msg.sender != v.validatorAddress) revert NotValidator();
        if (response > 100) revert BadResponse();
        v.response = response; v.responseHash = responseHash; v.tag = tag;
        v.lastUpdate = block.timestamp; v.responded = true;
        emit ValidationResponse(v.validatorAddress, v.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    // ── reads ──
    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string memory tag, uint256 lastUpdate) {
        Validation storage v = _validations[requestHash];
        if (!v.exists) revert UnknownRequest();
        return (v.validatorAddress, v.agentId, v.response, v.responseHash, v.tag, v.lastUpdate);
    }
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) { return _agentRequests[agentId]; }
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) { return _validatorRequests[validatorAddress]; }
    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external view returns (uint64 count, uint8 averageResponse) {
        bytes32[] storage reqs = _agentRequests[agentId];
        bytes32 want = bytes(tag).length > 0 ? keccak256(bytes(tag)) : bytes32(0);
        uint256 sum;
        for (uint256 i = 0; i < reqs.length; i++) {
            Validation storage v = _validations[reqs[i]];
            if (!v.responded) continue;
            if (want != bytes32(0) && keccak256(bytes(v.tag)) != want) continue;
            if (validatorAddresses.length > 0) {
                bool match_;
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (validatorAddresses[j] == v.validatorAddress) { match_ = true; break; }
                }
                if (!match_) continue;
            }
            sum += v.response; count++;
        }
        averageResponse = count > 0 ? uint8(sum / count) : 0;
    }
}
