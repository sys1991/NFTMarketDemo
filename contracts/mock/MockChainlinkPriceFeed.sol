// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockChainlinkPriceFeed
 * @dev 模拟 Chainlink 价格预言机，返回固定 ETH/USD 汇率
 */
contract MockChainlinkPriceFeed is AggregatorV3Interface {

    int256 private _price;
    uint8 private _decimals;

    constructor(int256 initialPrice, uint8 decimals_) {
        _price = initialPrice;
        _decimals = decimals_;
    }

    /**
     * @dev 返回最新价格
     */
    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, _price, block.timestamp, block.timestamp, 0);
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "Mock ETH/USD Feed";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 /*_roundId*/)
        external
        pure
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        revert("Not implemented");
    }

    /**
     * @dev 更新价格（测试用）
     */
    function setPrice(int256 price_) external {
        _price = price_;
    }
}
