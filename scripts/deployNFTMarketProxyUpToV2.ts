import { network } from "hardhat";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
async function upgradeUUPSProxy(
  ethers: any,
  proxyAddress: string,
  NewImplementationFactory: any,
  signer: any,
  initArgs?: any[], // 新增：初始化参数
  
  initFunctionName: string = "initializeV2", // 新增：初始化函数名
  
) {
  
  // 1. 部署新的实现合约
  const newImplementation = await NewImplementationFactory.connect(signer).deploy();
  await newImplementation.waitForDeployment();
  const newImplementationAddress = await newImplementation.getAddress();

  // 2. 编码初始化数据（如果有的话）
  let initData = "0x";
  if (initArgs && initArgs.length > 0) {
    initData = NewImplementationFactory.interface.encodeFunctionData(
      initFunctionName,
      initArgs
    );
  }

  // 3. 获取代理合约实例
  const proxy = await ethers.getContractAt(
    NewImplementationFactory.interface,
    proxyAddress
  );

  // 4. 调用 upgradeToAndCall 函数（原子化升级+初始化）
  const upgradeTx = await proxy.connect(signer).upgradeToAndCall(
    newImplementationAddress,
    initData
  );
  await upgradeTx.wait();

  // 5. 返回升级后的代理合约实例
//   return await ethers.getContractAt(NewImplementationFactory.interface, proxyAddress);
  return {
        proxy: await ethers.getContractAt(NewImplementationFactory.interface, proxyAddress),
        newImplementationAddress,
    };
}

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
    // console.log("nftMarketPlatformUpgradeV2Address:", nftMarketPlatformUpgradeV2Address);
    console.log("Network:", networkName);
    console.log("Deploying contracts with the account:", deployer.address);
    // 获取 V2 Factory
    const NFTMarketV2Factory = await ethers.getContractFactory("NFTMarketPlatformUpgradeV2");
    // 升级并初始化
    const { proxy, newImplementationAddress } = await upgradeUUPSProxy(
        ethers,
        proxyAddress,
        NFTMarketV2Factory,
        deployer,
        [mockUSDCAddress, mockChainlinkPriceFeedAddress],
        "initializeV2"
    );

    // 验证部署
    const NFTMarketPlatformUpgradeV2_ = await ethers.getContractAt(
        "NFTMarketPlatformUpgradeV2",
        proxyAddress
    );
    const upgradedAddress = await proxy.getAddress();
    console.log("\n=== Upgrade Info ===");
    console.log("Proxy Address (unchanged):", upgradedAddress);
    console.log("New Implementation Address:", newImplementationAddress);

    const deployedPlatformFee = await NFTMarketPlatformUpgradeV2_.platformFee();
    console.log("\n=== Verification ===");
    console.log("Platform Fee:", deployedPlatformFee.toString());
    return {
        proxy: upgradedAddress,
        implementation: newImplementationAddress,
    };
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
