// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MyNFT
 * @dev 完整的NFT合约实现，支持铸造、元数据管理和供应量控制
 * @notice 用OpenZeppelin库实现标准ERC721功能
 */
contract MyNFTToken is ERC721, ERC721URIStorage, Ownable {
    // tokenID 计数器
    uint256 private _tokenIdCounter;
    
    //最大供应量和铸造价格
    uint256 public constant MAX_SUPPLY = 100;
    uint256 public constant MINT_PRICE = 0.01 ether;

    /**
     * @dev 铸造事件
     * @param miner 铸造者地址 
     * @param tokenId NFT的ID
     * @param uri 图片的URI
     */
    event Minted(address indexed miner, uint256 tokenId, string uri);

    /**
     * @dev 构造函数，初始化ERC721代币名称和符号
     * @notice 初始化NFT集合名称和符号，设置合约所有者
     */
    constructor() ERC721("MyNFTToken", "MNFTTK") Ownable(msg.sender) {}   

    /**
     * @dev 铸造新的NFT并返回其tokenId
     * @param uri 图片的URI
     * @return tokenId 新铸造NFT的ID
     */
    function mint(string memory uri) external payable returns (uint256) {
        // 检查支付金额
        require(msg.value >= MINT_PRICE, "Incorrect Ether value sent");
        // 检查供应量限制
        require(_tokenIdCounter < MAX_SUPPLY, "Max supply reached");
        // 递增计数器并铸造NFT
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        // 安全铸造NFT
        _safeMint(msg.sender, newTokenId);
        // 设置元数据URI
        _setTokenURI(newTokenId, uri);
        // 触发铸造事件
        emit Minted(msg.sender, newTokenId, uri);
        // 返回新铸造NFT的ID
        return newTokenId;
    }

    /**
     * @dev 查询总供应量
     * @return 已铸造的NFT数量
     */
    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev 提现合约中的以太币到所有者地址
     * @notice 仅合约所有者可调用
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    /**
     * @dev 重写tokenURI函数
     * @param tokenId Token ID
     * @return 元数据URI
     * @notice 需要重写以解决多重继承的冲突
     */
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    /**
     * @dev 检查接口支持
     * @param interfaceId 接口ID
     * @return 是否支持该接口
     * @notice 实现ERC165标准，支持接口查询
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}   
