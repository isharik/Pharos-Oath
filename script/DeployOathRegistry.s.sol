// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/OathRegistry.sol";

contract DeployOathRegistry is Script {
    function run() external returns (OathRegistry registry) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry = new OathRegistry();
        vm.stopBroadcast();
    }
}
