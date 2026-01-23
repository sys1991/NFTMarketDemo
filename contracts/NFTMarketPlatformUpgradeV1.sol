// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";


/**
 * @title NFTMarketPlatformUpgradeV1
 * @dev 简单的NFT市场平台，允许用户列出、购买和取消NFT销售，以及进行英式拍卖
 * @notice 使用ReentrancyGuard防止重入攻击
 */
contract NFTMarketPlatformUpgradeV1 is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable, ERC165 {

    AggregatorV3Interface internal dataFeed;

    struct Action{
        address seller; //卖家地址
        address nftContract;//合约地址
        uint256 tokenId;//Token ID
        uint256 startPrice;//起始价格
        uint256 highestBid;//最高出价
        address highestBidder;//最高出价者
        uint256 endTime;//结束时间
        bool isActive;//是否激活
        // address amountTokenAddress;//支付代币地址 0x代表ETH 其他ERC20地址
    }


    // 拍卖映射
    mapping(uint256 => Action) public actions;
    uint256 public auctionCounter;

    //退款映射
    mapping(uint256 => mapping(address => uint256)) public pendingReturns;

    // 平台手续费[基点（bp），10000 = 100%]
    uint256 public platformFee = 200; 

    // 手续费接收地址
    address public feeRecipient;

    
    /**
     * 拍卖创建事件
     * @param auctionId action ID
     * @param seller 卖家地址
     * @param nftContract NFT合约地址
     * @param tokenId NFT的ID
     * @param startPrice 起始价格
     * @param endTime 结束时间
     */
    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 startPrice, uint256 endTime);

    /**
     * 竞拍事件
     * @param auctionId action ID
     * @param bidder 竞拍者地址
     * @param bidAmount 竞拍金额
     */
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount);

    /**
     * 拍卖结束事件
     * @param auctionId action ID
     * @param winner 最总拍卖获得者
     * @param finalPrice 最终价格
     */
    event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 finalPrice);

    /**
     * @dev 构造函数，设置手续费接收地址
     * @param _feeRecipient 手续费接收地址
     */
    function initialize(address _feeRecipient) public initializer {
        require(_feeRecipient != address(0), "Invalid feeRecipient address");

        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        feeRecipient = _feeRecipient;
        // dataFeed = AggregatorV3Interface(0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43);
    }

    function getChainlinkDataFeedLatestAnswer() public view returns (int256) {
        // prettier-ignore
        (
        /* uint80 roundId */
        ,
        int256 answer,
        /*uint256 startedAt*/
        ,
        /*uint256 updatedAt*/
        ,
        /*uint80 answeredInRound*/
        ) = dataFeed.latestRoundData();
        return answer;
    }

    /**
     * @dev 授权升级，仅合约所有者可调用
     * @param newImplementation 新的实现合约地址
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // 仅合约所有者可升级
        require(newImplementation.code.length > 0, "Not a contract");
        require(newImplementation!=address(0), "newImplementation is zero address");
    }
   
    /**
     * @dev 创建拍卖
     * @param nftContract NFT合约地址
     * @param tokenId NFT的ID
     * @param startPrice 起始价格
     * @param durationHours 拍卖持续时间（小时）
     * @return auctionId 新创建的拍卖ID
     */
    function createAuction(address nftContract, uint256 tokenId, uint256 startPrice, uint256 durationHours) external returns (uint256) {
        require(nftContract != address(0), "Invalid NFT contract");
        require(startPrice > 0, "Start price must be greater than 0");
        require(durationHours >= 1, "Duration must be greater than 1");
        IERC721 token = IERC721(nftContract);
        require(token.ownerOf(tokenId) == msg.sender, "seller is not the owner");
        require(token.getApproved(tokenId) == address(this) || token.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");

        auctionCounter++;
        uint256 auctionId = auctionCounter;
        actions[auctionId] = Action({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            startPrice: startPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + (durationHours * 1 hours),
            isActive: true
        });

        emit AuctionCreated(auctionId, msg.sender, nftContract, tokenId, startPrice, block.timestamp + (durationHours * 1 hours));
        return auctionId;
    }

    /**
     * @dev 出价
     * @param auctionId 拍卖ID
     * @notice 需要支付足够的ETH，出价必须高于当前最高出价的5%
     */
    function placeBid(uint256 auctionId) external payable {
        Action storage auction = actions[auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp < auction.endTime, "Auction has ended");
        require(msg.value >= auction.startPrice, "Bid must be at least the start price");
        require(msg.value > auction.highestBid, "There already is a higher or equal bid");
        require(msg.sender != auction.seller, "Seller cannot bid on their own auction");

        // 计算最低出价
        uint256 minBid;
        if (auction.highestBid == 0) {
            minBid = auction.startPrice;
        } else {
            minBid = auction.highestBid + (auction.highestBid * 5 / 100); // 5% increment
        }

        require(msg.value >= minBid, "Bid amount too low");
        // 如果有之前的出价者，记录他们的待退款金额
        if (auction.highestBidder != address(0)) {
            pendingReturns[auctionId][auction.highestBidder] += auction.highestBid;
        }

        // 更新最高出价
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }
    /**
     * @dev 提取出价失败的资金
     * @param auctionId 拍卖ID
     */
    function withdrawBid(uint256 auctionId) external {
        uint256 amount = pendingReturns[auctionId][msg.sender];
        require(amount > 0, "No funds to withdraw");

        // 清零待退款金额
        pendingReturns[auctionId][msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdraw failed");
    }
   

    /**
     * @dev 获取所有活跃的拍卖列表
     * @return 活跃auction的ID数组
     */
    function getActiveAuctions() external view returns (uint256[] memory) {
        uint256[] memory activeIds = new uint256[](auctionCounter);
        uint256 count = 0;
        
        for (uint256 i = 1; i <= auctionCounter; i++) {
            if (actions[i].isActive) {
                activeIds[count] = i;
                count++;
            }
        }
        
        // 返回实际大小的数组
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activeIds[i];
        }
        return result;
    }

    /**
     * @dev 结束拍卖
     * @param auctionId 拍卖ID
     * @notice 只有拍卖结束后才能调用
     */
    function endAction(uint256 auctionId) external {
        Action storage auction = actions[auctionId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp >= auction.endTime, "Auction has not ended yet");

        // 更新拍卖状态
        actions[auctionId].isActive = false;

        if (auction.highestBidder != address(0)) {
            // 计算手续费
            uint256 feeAmount = (auction.highestBid * platformFee) / 10000;
            uint256 sellerAmount = auction.highestBid - feeAmount;

            // 转账给卖家
            (bool successSeller, ) = auction.seller.call{value: sellerAmount}("");
            require(successSeller, "Transfer to seller failed");

            // 转账手续费
            (bool successFee, ) = feeRecipient.call{value: feeAmount}("");
            require(successFee, "Transfer fee failed");

            // 转移NFT给最高出价者
            IERC721 token = ERC721(auction.nftContract);
            token.safeTransferFrom(auction.seller, auction.highestBidder, auction.tokenId);

            emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBid);
        } else {
            // 如果没有出价者，NFT保持在卖家手中
            emit AuctionEnded(auctionId, address(0), 0);
        }
    }

    /**
    * @dev 获取拍卖详情
    * @param auctionId 拍卖ID
    * @return 拍卖详情
    * @notice 返回Action结构体
    */
    function getAuction(uint256 auctionId) external view returns (Action memory) {
        return actions[auctionId];
    }
    /**
     * @dev 设置平台手续费
     * @param _platformFee 新的手续费（基点，10000 = 100%） 最大值为1000（10%）
     * @notice 仅合约所有者可调用 
     */
    function setPlatformFee(uint256 _platformFee) external onlyOwner {
        require(_platformFee <= 1000, "Fee too high"); // 最大10%
        platformFee = _platformFee;
    }
    /**
     * @dev 更新手续费接收地址
     * @param _feeRecipient 新的手续费接收地址
     */
    function updateFeeRecipient(address _feeRecipient) external onlyOwner {
        require(address(0)!=_feeRecipient,"Invalid feeRecipient address");
        feeRecipient = _feeRecipient;
    }


}   