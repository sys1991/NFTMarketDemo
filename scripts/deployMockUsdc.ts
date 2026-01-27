import { network } from "hardhat";

async function main() {
    const connection = await network.connect();

    const { ethers } = connection;
    const [deployer] = await ethers.getSigners();
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
    console.log("Network:", networkName);

    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Deploying MockUSDC contract to", networkName, "network");
    const mockUSDC = await ethers.deployContract("MockUSDC");
    console.log("MockUSDC deployed to:", mockUSDC.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
