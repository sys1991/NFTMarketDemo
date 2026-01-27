import { network } from "hardhat";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
/**
 * 手动部署 UUPS 代理（因为 hre.upgrades 在 Hardhat 3 中不可用）
 */
async function deployUUPSProxy(ContractFactory: any, initArgs: any[], signer: any, ethers: any) {
    // 1. 部署实现合约
    const implementation = await ContractFactory.connect(signer).deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();

    // 2. 获取初始化数据
    const initData = ContractFactory.interface.encodeFunctionData("initialize", initArgs);

    // 3. 从 OpenZeppelin 的 artifact 读取 ERC1967Proxy
    const ERC1967ProxyArtifact = require("@openzeppelin/contracts/build/contracts/ERC1967Proxy.json");
    const ERC1967ProxyFactory = new ethers.ContractFactory(
        ERC1967ProxyArtifact.abi,
        ERC1967ProxyArtifact.bytecode,
        signer
    );
    
    // 4. 部署代理
    const proxy = await ERC1967ProxyFactory.deploy(implementationAddress, initData);
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();

    // 5. 返回代理合约实例
    return {
        proxy: await ethers.getContractAt(ContractFactory.interface, proxyAddress),
        implementationAddress,
    };
}

async function main() {
    const connection = await network.connect();

    const { ethers } = connection;
    const [deployer] = await ethers.getSigners();

    console.log("Deploying MarketProxy with UUPS Proxy...");
    console.log("Deployer:", deployer.address);

    const nftMarketPlatformUpgradeV1Address = process.env.NFT_MARKETPLATFORM_UPGRADE_V1_ADDRESS || "0x0000000000000000000000000000000000000000";

    if (nftMarketPlatformUpgradeV1Address == "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "Please deploy modules first using deployNFTMarketPlatformUpgradeV1.ts and set NFT_MARKETPLATFORM_UPGRADE_V1_ADDRESS in .env"
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
    console.log("nftMarketPlatformUpgradeV1Address:", nftMarketPlatformUpgradeV1Address);
    console.log("Network:", networkName);
    console.log("Deploying contracts with the account:", deployer.address);

    // 获取合约工厂
    const NFTMarketPlatformUpgradeV1 = await ethers.getContractFactory(
        "NFTMarketPlatformUpgradeV1"
    );

    // 部署 UUPS 代理
    const { proxy, implementationAddress } = await deployUUPSProxy(
        NFTMarketPlatformUpgradeV1,
        [nftMarketPlatformUpgradeV1Address],
        deployer,
        ethers
    );
    const proxyAddress = await proxy.getAddress();
    console.log("NFTMarketProxy deployed to:", proxyAddress);

    // 验证部署
    const NFTMarketPlatformUpgradeV1_ = await ethers.getContractAt(
        "NFTMarketPlatformUpgradeV1",
        proxyAddress
    );

    const deployedPlatformFee = await NFTMarketPlatformUpgradeV1_.platformFee();
    console.log("\n=== Verification ===");
    console.log("Platform Fee:", deployedPlatformFee.toString());
    return {
        proxy: proxyAddress,
        implementation: implementationAddress,
    };
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
