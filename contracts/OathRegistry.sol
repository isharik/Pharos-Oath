// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OATH Registry
/// @notice Anchors hashes only; no funds or report contents are stored.
contract OathRegistry {
    struct Anchor {
        address reporter;
        uint64 timestamp;
        uint8 kind; // 1 = report, 2 = policy
    }

    mapping(bytes32 => Anchor) private anchors;

    event HashAnchored(bytes32 indexed hash, address indexed reporter, uint8 indexed kind, uint64 timestamp);

    error ZeroHash();
    error AlreadyAnchored();

    function registerReport(bytes32 reportHash) external {
        _register(reportHash, 1);
    }

    function registerPolicy(bytes32 policyHash) external {
        _register(policyHash, 2);
    }

    function verify(bytes32 hash) external view returns (bool exists, address reporter, uint64 timestamp, uint8 kind) {
        Anchor memory anchor = anchors[hash];
        return (anchor.timestamp != 0, anchor.reporter, anchor.timestamp, anchor.kind);
    }

    function _register(bytes32 hash, uint8 kind) private {
        if (hash == bytes32(0)) revert ZeroHash();
        if (anchors[hash].timestamp != 0) revert AlreadyAnchored();
        uint64 timestamp = uint64(block.timestamp);
        anchors[hash] = Anchor(msg.sender, timestamp, kind);
        emit HashAnchored(hash, msg.sender, kind, timestamp);
    }
}
