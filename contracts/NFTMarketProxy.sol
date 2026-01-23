// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @title NFTMarketProxy
 * @dev 代理合约，用于委托调用到 NFTMarketPlatform（逻辑合约）
 * @notice 使用 OpenZeppelin 的 TransparentUpgradeableProxy 实现
 */
contract NFTMarketProxy is TransparentUpgradeableProxy {
    /**
     * @dev 初始化代理合约
     * @param _logic 逻辑合约地址（NFTMarketPlatform 合约地址）
     * @param _admin 管理员地址（可以升级逻辑合约）
     * @param _data 初始化调用数据（调用 NFTMarketPlatform 的 constructor）
     */
    constructor(
        address _logic,
        address _admin,
        bytes memory _data
    ) TransparentUpgradeableProxy(_logic, _admin, _data) {}
}
