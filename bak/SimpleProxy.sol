// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NFTMarketProxy
 * @dev 自定义代理合约，用于委托调用到 NFTMarketPlatform（逻辑合约）
 * @notice 支持可升级的逻辑合约
 */
contract NFTMarketProxy {
    // 使用特定的存储槽来存储逻辑合约地址和管理员地址，避免存储冲突
    // slots: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc (逻辑合约)
    // slots: 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103 (管理员)
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 private constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    /**
     * @dev 初始化代理合约
     * @param _implementation 逻辑合约地址
     * @param _admin 管理员地址
     */
    constructor(address _implementation, address _admin) {
        require(_implementation != address(0), "Invalid implementation address");
        require(_admin != address(0), "Invalid admin address");

        // 使用内联汇编直接写入存储槽
        assembly {
            sstore(IMPLEMENTATION_SLOT, _implementation)
            sstore(ADMIN_SLOT, _admin)
        }
    }

    /**
     * @dev 升级逻辑合约（仅管理员可调用）
     * @param newImplementation 新的逻辑合约地址
     */
    function upgradeTo(address newImplementation) external {
        require(msg.sender == _getAdmin(), "Only admin can upgrade");
        require(newImplementation != address(0), "Invalid implementation address");
        _setImplementation(newImplementation);
        emit Upgraded(newImplementation);
    }

    /**
     * @dev 升级逻辑合约并调用初始化函数
     * @param newImplementation 新的逻辑合约地址
     * @param data 初始化函数调用数据
     */
    function upgradeToAndCall(address newImplementation, bytes calldata data) external {
        require(msg.sender == _getAdmin(), "Only admin can upgrade");
        require(newImplementation != address(0), "Invalid implementation address");
        _setImplementation(newImplementation);
        
        // 调用初始化函数
        (bool success, ) = newImplementation.delegatecall(data);
        require(success, "Initialization call failed");
        
        emit Upgraded(newImplementation);
    }

    /**
     * @dev 获取当前逻辑合约地址
     */
    function _getImplementation() private view returns (address implementation) {
        assembly {
            implementation := sload(IMPLEMENTATION_SLOT)
        }
    }

    /**
     * @dev 获取管理员地址
     */
    function _getAdmin() private view returns (address admin) {
        assembly {
            admin := sload(ADMIN_SLOT)
        }
    }

    /**
     * @dev 设置逻辑合约地址
     */
    function _setImplementation(address newImplementation) private {
        assembly {
            sstore(IMPLEMENTATION_SLOT, newImplementation)
        }
    }

    /**
     * @dev fallback 函数，捕获所有调用并委托给逻辑合约
     */
    fallback() external payable {
        address implementation = _getImplementation();
        require(implementation != address(0), "Implementation not set");

        assembly {
            // 复制调用数据
            calldatacopy(0, 0, calldatasize())
            
            // 使用 delegatecall 调用逻辑合约
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            
            // 复制返回数据
            returndatacopy(0, 0, returndatasize())
            
            // 根据结果返回或回滚
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    /**
     * @dev receive 函数，接收 ETH
     */
    receive() external payable {}

    /**
     * @dev 升级事件
     */
    event Upgraded(address indexed implementation);
}
