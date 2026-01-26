// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NFTMarketPlatformUpgradeV2
 * @author ---
 * @notice NFT 拍卖平台 V2 版本
 *
 * 设计目标：
 * 1. 在 V1 基础上新增 USDC 出价能力
 * 2. 使用 Chainlink ETH / USD 预言机统一价值比较
 * 3. 严格遵守 UUPS Upgradeable Storage 向后兼容规则
 *
 * ⚠️ 重要原则：
 * - ❌ 不允许修改 / 删除 V1 的任何 storage
 * - ✅ 只允许在 V1 之后 append 新变量
 */
import "./NFTMarketPlatformUpgradeV1.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract NFTMarketPlatformUpgradeV2 is NFTMarketPlatformUpgradeV1 {

    /* =============================================================
                                V2 新增 Storage
       ============================================================= */

    /**
     * @notice 出价币种枚举
     * ETH  : 原生 ETH 出价（兼容 V1）
     * USDC : ERC20 USDC 出价（V2 新增）
     */
    enum BidCurrency {
        ETH,
        USDC
    }

    /**
     * @notice V2 扩展拍卖数据
     * @dev 不修改 V1 的 Action 结构体，通过旁路结构存储新信息
     */
    struct ActionV2 {
        BidCurrency currency;     // 当前最高出价的币种
        uint256 usdcBidAmount;    // 如果是 USDC 出价，对应的 USDC 数量
    }

    /**
     * @dev auctionId => V2 扩展数据
     * 注意：这是 V2 新增 storage，必须 append 在 V1 之后
     */
    mapping(uint256 => ActionV2) internal actionV2Data;

    /// @notice USDC ERC20 合约地址
    IERC20 public usdcToken;

    /// @notice Chainlink ETH / USD 价格预言机
    AggregatorV3Interface public ethUsdPriceFeed;

    /// @dev USDC 精度（6 位）
    uint256 private constant USDC_DECIMALS = 6;

    /// @dev Chainlink ETH/USD 精度（8 位）
    uint256 private constant PRICE_FEED_DECIMALS = 8;

    /* =============================================================
                                V2 初始化函数
       ============================================================= */

    /**
     * @notice V2 初始化函数（只会执行一次）
     * @dev 使用 reinitializer(2)，确保不会重复执行
     *
     * @param _usdc USDC ERC20 合约地址
     * @param _ethUsdFeed Chainlink ETH/USD 预言机地址
     */
    function initializeV2(
        address _usdc,
        address _ethUsdFeed
    ) external reinitializer(2) {
        require(_usdc != address(0), "invalid usdc address");
        require(_ethUsdFeed != address(0), "invalid price feed");

        usdcToken = IERC20(_usdc);
        ethUsdPriceFeed = AggregatorV3Interface(_ethUsdFeed);
    }

    /* =============================================================
                            USDC 出价逻辑
       ============================================================= */

    /**
     * @notice 使用 USDC 进行出价
     *
     * 核心逻辑：
     * 1. 将 USDC 金额换算为等值 ETH
     * 2. 与当前最高出价（ETH 价值）进行比较
     * 3. 若成功，记录币种和 USDC 数量
     *
     * @param auctionId 拍卖 ID
     * @param usdcAmount 出价的 USDC 数量（6 位精度）
     */
    function placeBidWithUSDC(
        uint256 auctionId,
        uint256 usdcAmount
    ) external nonReentrant {

        Action storage auction = actions[auctionId];
        ActionV2 storage v2 = actionV2Data[auctionId];

        require(auction.isActive, "auction not active");
        require(block.timestamp < auction.endTime, "auction ended");
        require(usdcAmount > 0, "zero usdc bid");
        require(msg.sender != auction.seller, "seller cannot bid");

        // 将 USDC 换算成等值 ETH（18 位精度）
        uint256 bidValueInEth = _usdcToEth(usdcAmount);

        // 当前最高出价（统一使用 ETH 价值）
        uint256 currentValue = auction.highestBid;

        // 最低加价规则（5%）
        require(
            bidValueInEth >= _minNextBidValue(currentValue),
            "bid too low"
        );

        // 退还上一位竞拍者的资金（ETH / USDC）
        _refundPreviousBidder(auctionId);

        // 从竞拍者账户转入 USDC
        require(
            usdcToken.transferFrom(msg.sender, address(this), usdcAmount),
            "usdc transfer failed"
        );

        // 更新 V1 拍卖核心数据（ETH 等值）
        auction.highestBidder = msg.sender;
        auction.highestBid = bidValueInEth;

        // 更新 V2 扩展数据
        v2.currency = BidCurrency.USDC;
        v2.usdcBidAmount = usdcAmount;

        emit BidPlaced(auctionId, msg.sender, bidValueInEth);
    }

    /* =============================================================
                        ETH 出价（兼容 V1）
       ============================================================= */

    /**
     * @notice ETH 出价（复用 V1 逻辑）
     * @dev 覆盖 V1 函数以同步更新 V2 状态
     */
    function placeBid(uint256 auctionId)
        public
        payable
        override
        nonReentrant
    {
        super.placeBid(auctionId);

        // 标记该拍卖当前最高出价为 ETH
        ActionV2 storage v2 = actionV2Data[auctionId];
        v2.currency = BidCurrency.ETH;
        v2.usdcBidAmount = 0;
    }

    /* =============================================================
                            内部工具函数
       ============================================================= */

    /**
     * @dev 退还上一位竞拍者的出价
     * ETH：进入 pendingReturns
     * USDC：直接转账退回
     */
    function _refundPreviousBidder(uint256 auctionId) internal {
        Action storage auction = actions[auctionId];
        ActionV2 storage v2 = actionV2Data[auctionId];

        if (auction.highestBidder == address(0)) return;

        if (v2.currency == BidCurrency.ETH) {
            pendingReturns[auctionId][auction.highestBidder]
                += auction.highestBid;
        } else {
            require(
                usdcToken.transfer(
                    auction.highestBidder,
                    v2.usdcBidAmount
                ),
                "usdc refund failed"
            );
        }
    }

    /**
     * @dev 计算最小加价（当前价 + 5%）
     */
    function _minNextBidValue(uint256 current)
        internal
        pure
        returns (uint256)
    {
        if (current == 0) return 0;
        return current + (current * 5) / 100;
    }

    /**
     * @dev USDC → ETH 价值换算
     *
     * 计算路径：
     * USDC(6) → USD(8) → ETH(18)
     */
    function _usdcToEth(uint256 usdcAmount)
        internal
        view
        returns (uint256)
    {
        (, int256 price,,,) = ethUsdPriceFeed.latestRoundData();
        require(price > 0, "invalid eth price");

        uint256 ethPrice = uint256(price);

        return (usdcAmount * 1e12 * 1e18) / ethPrice;
    }

    /* =============================================================
                            只读辅助函数
       ============================================================= */

    /**
     * @notice 获取拍卖当前最高出价的币种
     */
    function getBidCurrency(uint256 auctionId)
        external
        view
        returns (BidCurrency)
    {
        return actionV2Data[auctionId].currency;
    }

    /**
     * @notice 获取 USDC 出价金额（若当前为 USDC）
     */
    function getUSDCBid(uint256 auctionId)
        external
        view
        returns (uint256)
    {
        return actionV2Data[auctionId].usdcBidAmount;
    }
}
