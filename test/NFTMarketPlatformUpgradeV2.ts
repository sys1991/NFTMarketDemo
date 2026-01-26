import { expect } from "chai";
import { network } from "hardhat";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let ethersInstance: any;
let networkHelpers: any;

before(async function () {
  const connection = await network.connect();
  ethersInstance = connection.ethers;
  networkHelpers = connection.networkHelpers;
});

/**
 * 手动部署 UUPS 代理（因为 hre.upgrades 在 Hardhat 3 中不可用）
 */
async function deployUUPSProxy(
  ContractFactory: any,
  initArgs: any[],
  signer: any
) {
  const ethers = ethersInstance;
  
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
  return await ethers.getContractAt(ContractFactory.interface, proxyAddress);
}

/**
 * 手动升级 UUPS 代理（因为 hre.upgrades 在 Hardhat 3 中不可用）
 */
/**
 * 手动升级 UUPS 代理，支持初始化
 */
async function upgradeUUPSProxy(
  proxyAddress: string,
  NewImplementationFactory: any,
  signer: any,
  initArgs?: any[], // 新增：初始化参数
  initFunctionName: string = "initializeV2" // 新增：初始化函数名
) {
  const ethers = ethersInstance;
  
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
  return await ethers.getContractAt(NewImplementationFactory.interface, proxyAddress);
}

/**
 * 部署 V1 测试环境
 */
async function deployFixture() {
  const ethers = ethersInstance;
  const [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();

  const NFTMarketV1Factory = await ethers.getContractFactory("NFTMarketPlatformUpgradeV1");
  const nftMarketProxy = await deployUUPSProxy(NFTMarketV1Factory, [addr4.address], owner);

  const proxyAsLogic = await ethers.getContractAt("NFTMarketPlatformUpgradeV1", await nftMarketProxy.getAddress());

  // 模拟 NFT 合约
  const MyNFTToken = await ethers.getContractFactory("MyNFTToken");
  const myNFTToken = await MyNFTToken.deploy();
  await myNFTToken.waitForDeployment();

  return { nftMarketProxy, proxyAsLogic, owner, addr1, addr2, addr3, addr4, myNFTToken };
}

describe("NFTMarketPlatform V1 -> V2 Upgrade Tests", function () {

  it("Deploy V1 and test ETH auction", async function () {
    const { nftMarketProxy, proxyAsLogic, owner, addr1, myNFTToken } = await deployFixture();
    const ethers = ethersInstance;

    // 铸造 NFT
    await myNFTToken.mint("https://example.com/1", { value: ethers.parseEther("0.01") });
    await myNFTToken.approve(await nftMarketProxy.getAddress(), 1);

    // 创建拍卖
    const tx = await nftMarketProxy.createAuction(myNFTToken.target, 1, ethers.parseEther("0.05"), 24);
    await tx.wait();

    // 出价
    await expect(nftMarketProxy.connect(addr1).placeBid(1, { value: ethers.parseEther("0.05") }))
      .to.emit(nftMarketProxy, "BidPlaced")
      .withArgs(1, addr1.address, ethers.parseEther("0.05"));
  });

  it("Upgrade to V2 and test USDC bid", async function () {
    const ethers = ethersInstance;
    const { nftMarketProxy, owner, addr1, myNFTToken } = await deployFixture();

    // 部署 Mock 合约
    const usdcToken = await ethers.deployContract("MockUSDC");
    const chainlinkMock = await ethers.deployContract("MockChainlinkPriceFeed", [2000, 18]);

    // 获取 V2 Factory
    const NFTMarketV2Factory = await ethers.getContractFactory("NFTMarketPlatformUpgradeV2");
    
    console.log("Upgrading to V2...");
    
    try {
      // 升级并初始化
      const proxyV2 = await upgradeUUPSProxy(
        nftMarketProxy.target,
        NFTMarketV2Factory,
        owner,
        [usdcToken.target, chainlinkMock.target],
        "initializeV2"
      );
      
      console.log("Upgrade successful");
      
      // 验证初始化成功
      const v2USDC = await proxyV2.usdcToken();
      const v2PriceFeed = await proxyV2.ethUsdPriceFeed();
      
      console.log("USDC Token:", v2USDC);
      console.log("Price Feed:", v2PriceFeed);
      
      expect(v2USDC).to.equal(usdcToken.target);
      expect(v2PriceFeed).to.equal(chainlinkMock.target);
      expect(proxyV2.target).to.equal(nftMarketProxy.target);
      
      // 铸造 NFT
      // await myNFTToken.mint("https://example.com/2", { value: ethers.parseEther("0.01") });
      // await myNFTToken.approve(proxyV2.target, 2);
  // 铸造 NFT
      const mintTx = await myNFTToken.mint("https://example.com/1", { value: ethers.parseEther("0.01") });
      
      await mintTx.wait();
      await myNFTToken.approve(nftMarketProxy.target, 1);

      
      // 创建拍卖 - 注意：需要调整 auctionId
      // 因为在 V1 中已经创建了一个拍卖（id: 1）
      const tx = await proxyV2.createAuction(myNFTToken.target, 1, ethers.parseEther("0.05"), 24);
      await tx.wait();
      
  
      const newAuctionId=1


      // addr1 mint USDC 并 approve
      await usdcToken.mint(addr1.address, 1_000_000);
      await usdcToken.connect(addr1).approve(proxyV2.target, 1_000_000);

      // 使用 USDC 出价
      await expect(proxyV2.connect(addr1).placeBidWithUSDC(newAuctionId, 500_000))
        .to.emit(proxyV2, "BidPlaced");

      const currency = await proxyV2.getBidCurrency(newAuctionId);
      expect(currency).to.equal(1); // 1 = USDC

      const usdcBid = await proxyV2.getUSDCBid(newAuctionId);
      expect(usdcBid).to.equal(500_000);
      
    } catch (error: any) {
      console.error("Upgrade failed:", error.message);
      
      // 打印详细错误
      if (error.data) {
        console.error("Error data:", error.data);
        
        // 尝试解析错误
        try {
          const NFTMarketV1Factory = await ethers.getContractFactory("NFTMarketPlatformUpgradeV1");
          const decoded = NFTMarketV1Factory.interface.parseError(error.data);
          console.error("Parsed error:", decoded);
        } catch (e) {
          console.error("Cannot parse error:", e);
        }
      }
      throw error;
    }
});



  it("V2 ETH bid still works", async function () {
    const ethers = ethersInstance;
    const { nftMarketProxy, owner, addr1, addr2, myNFTToken } = await deployFixture();
   // 部署 Mock 合约
    const usdcToken = await ethers.deployContract("MockUSDC");
    const chainlinkMock = await ethers.deployContract("MockChainlinkPriceFeed", [2000, 18]);

    // 获取 V2 Factory
    const NFTMarketV2Factory = await ethers.getContractFactory("NFTMarketPlatformUpgradeV2");
    const proxyV2 = await upgradeUUPSProxy(
        nftMarketProxy.target,
        NFTMarketV2Factory,
        owner,
        [usdcToken.target, chainlinkMock.target],
        "initializeV2"
      );
      
      console.log("Upgrade successful");
      
      // 验证初始化成功
      const v2USDC = await proxyV2.usdcToken();
      const v2PriceFeed = await proxyV2.ethUsdPriceFeed();
      
      console.log("USDC Token:", v2USDC);
      console.log("Price Feed:", v2PriceFeed);
      
      expect(v2USDC).to.equal(usdcToken.target);
      expect(v2PriceFeed).to.equal(chainlinkMock.target);
      expect(proxyV2.target).to.equal(nftMarketProxy.target);

    // 铸造 NFT
    await myNFTToken.mint("https://example.com/1", { value: ethers.parseEther("0.01") });
    await myNFTToken.approve(proxyV2.target, 1);

    // 创建拍卖
    await proxyV2.createAuction(myNFTToken.target, 1, ethers.parseEther("0.05"), 24);
    // ETH 出价
    await expect(proxyV2.connect(addr2).placeBid(1, { value: ethers.parseEther("0.06") }))
      .to.emit(proxyV2, "BidPlaced");

    const currency = await proxyV2.getBidCurrency(1);
    expect(currency).to.equal(0); // 0 = ETH
  });
});
