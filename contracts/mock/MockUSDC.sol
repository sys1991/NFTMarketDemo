// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @dev 简单的 ERC20 模拟 USDC，用于测试
 *      小数位 6 位，允许 mint 给任意地址
 */
contract MockUSDC is ERC20 {

    uint8 private constant _decimals = 6;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    /**
     * @dev 重写 decimals
     */
    function decimals() public pure override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev 测试用 mint
     * @param to 接收地址
     * @param amount 数量（按 6 位小数）
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
