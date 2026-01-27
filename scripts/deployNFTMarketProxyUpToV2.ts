import { network } from "hardhat";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

async function main() {
    const connection = await network.connect();

    const { ethers } = connection;
    const [deployer] = await ethers.getSigners();

    console.log("Deploying MarketProxy with UUPS Proxy...");
    console.log("Deployer:", deployer.address);

    const proxyAddress = process.env.PROXY_ADDRESS || "0x0000000000000000000000000000000000000000";

    if (proxyAddress == "0x0000000000000000000000000000000000000000") {
        throw new Error(
            "Please provide proxy address via PROXY_ADDRESS env var"
        );
    }

    const mockUSDCAddress = process.env.MOCK_USDC_ADDRESS || "0x0000000000000000000000000000000000000000";

    if (mockUSDCAddress == "0x0000000000000000000000000000000000000000") {
        throw new Error(
            "Please provide mockUSDCAddress address via MOCK_USDC_ADDRESS env var"
        );
    }

    const mockChainlinkPriceFeedAddress = process.env.MOCK_CHAINLINK_PRICE_FEED_ADDRESS || "0x0000000000000000000000000000000000000000";

    if (mockChainlinkPriceFeedAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error(
            "Please provide mockChainlinkPriceFeedAddress address via MOCK_CHAINLINK_PRICE_FEED_ADDRESS env var"
        );
    }


    const nftMarketPlatformUpgradeV2Address = process.env.NFT_MARKETPLATFORM_UPGRADE_V2_ADDRESS || "";

    if (!nftMarketPlatformUpgradeV2Address) {
    throw new Error(
      "Please deploy modules first using deployNFTMarketPlatformUpgradeV2.ts and set NFT_MARKETPLATFORM_UPGRADE_V2_ADDRESS in .env"
    );
  }
    // 获取网络名称（从命令行参数 --network 获取）
    let networkName = "localhost"; // 默认值
    const networkIndex = process.argv.indexOf("--network");
    if (networkIndex !== -1 && process.argv[networkIndex + 1]) {
        networkName = process.argv[networkIndex + 1];
    } else {
        // 如果命令行参数中没有，尝试根据 chainId 判断
        const networkInfo = await ethers.provider.getNetwork();
        const chainId = Number(networkInfo.chainId);
        if (chainId === 11155111) {
            networkName = "sepolia";
        } else if (chainId === 1) {
            networkName = "mainnet";
        } else if (chainId === 31337) {
            networkName = "hardhat";
        }
    }

    console.log("\n=== Configuration ===");
    console.log("nftMarketPlatformUpgradeV2Address:", nftMarketPlatformUpgradeV2Address);
    console.log("Network:", networkName);
    console.log("Deploying contracts with the account:", deployer.address);

    // 获取合约工厂
    const proxy = await ethers.getContractAt(
        "NFTMarketPlatformUpgradeV2",
        proxyAddress
    );

    // 调用 upgradeToAndCall 函数（UUPS 模式）
    console.log("Upgrading proxy to new implementation...");
    const upgradeTx = await proxy.connect(deployer).upgradeToAndCall(
        nftMarketPlatformUpgradeV2Address,
        "0x" // 空数据，只升级
    );
     await upgradeTx.wait();
    console.log("Upgrade transaction confirmed");
    const upgradedAddress = proxyAddress; // 代理地址不变
    console.log("NFTMarketProxy deployed to:", proxyAddress);

    // 验证部署
    const NFTMarketPlatformUpgradeV2_ = await ethers.getContractAt(
        "NFTMarketPlatformUpgradeV2",
        proxyAddress
    );

    // 调用V2的初始化函数
  try {
    const tx = await NFTMarketPlatformUpgradeV2_.initializeV2(mockUSDCAddress,mockChainlinkPriceFeedAddress);
    await tx.wait();
    console.log(" V2 initialization completed");
  } catch (error: any) {
    if (error.message.includes("already initialized")) {
      console.log(" V2 already initialized");
    } else {
      throw error;
    }
  }

    const deployedPlatformFee = await NFTMarketPlatformUpgradeV2_.platformFee();
    console.log("\n=== Verification ===");
    console.log("Platform Fee:", deployedPlatformFee.toString());
    return {
        proxy: proxyAddress,
        implementation: nftMarketPlatformUpgradeV2Address,
    };
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
