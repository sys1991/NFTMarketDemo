// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/NFTMarketPlatform.sol";
import "../contracts/NFTMarketProxy.sol";

/**
 * @title NFTMarketDeployment
 * @dev 部署脚本，用于部署代理合约和逻辑合约
 */
contract NFTMarketDeployment {
    /**
     * @dev 部署 NFT 市场合约及其代理
     * @param feeRecipient 手续费接收地址
     * @param admin 代理管理员地址（可以升级合约）
     * @return proxy 代理合约地址
     * @return implementation 逻辑合约地址
     */
    function deploy(
        address feeRecipient,
        address admin
    ) external returns (address proxy, address implementation) {
        // 1. 部署逻辑合约（NFTMarketPlatform）
        NFTMarketPlatform nftMarket = new NFTMarketPlatform(feeRecipient);
        implementation = address(nftMarket);

        // 2. 准备初始化数据
        // 这里我们不需要初始化数据，因为 NFTMarketPlatform 的 constructor 已经被调用过了
        // 如果需要在代理部署时初始化，可以使用 abi.encodeWithSelector(...)
        bytes memory initData = "";

        // 3. 部署代理合约
        NFTMarketProxy nftMarketProxy = new NFTMarketProxy(
            implementation,
            admin,
            initData
        );
        proxy = address(nftMarketProxy);

        return (proxy, implementation);
    }
}
