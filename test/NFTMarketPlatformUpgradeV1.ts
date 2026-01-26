import { expect } from "chai";
import { network, } from "hardhat";
import { createRequire } from "module";
// 导入类型扩展以支持 hre.upgrades
// import "@openzeppelin/hardhat-upgrades";
// 导入 Chai matchers 以支持 revertedWithCustomError
import "@nomicfoundation/hardhat-ethers-chai-matchers";
import { sign } from "crypto";

const require = createRequire(import.meta.url);

// 获取网络连接和辅助工具
let networkHelpers: any;
let ethersInstance: any;
// const { ethers, networkHelpers } = await network.connect();
before(async function () {
  const connection = await network.connect();
  // @ts-ignore - networkHelpers 和 ethers 属性由插件添加
  networkHelpers = connection.networkHelpers;
  // @ts-ignore
  ethersInstance = connection.ethers;
});

/**
 * 手动部署 UUPS 代理（因为 hre.upgrades 在 Hardhat 3 中不可用）
 */
async function deployUUPSProxy(ContractFactory: any, initArgs: any[], signer: any) {
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
async function upgradeUUPSProxy(proxyAddress: string, NewImplementationFactory: any, signer: any) {
    const ethers = ethersInstance;
    
    // 1. 部署新的实现合约
    const newImplementation = await NewImplementationFactory.connect(signer).deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();

    // 2. 获取代理合约实例（使用新实现的接口）
    // 在 UUPS 模式中，upgradeToAndCall 函数在实现合约中（继承自 UUPSUpgradeable）
    const proxy = await ethers.getContractAt(
        NewImplementationFactory.interface,
        proxyAddress
    );

    // 3. 调用 upgradeToAndCall 函数（UUPS 模式）
    // upgradeToAndCall 是 UUPSUpgradeable 提供的公共函数，可以通过代理调用
    // 传入空数据，只升级不调用初始化函数
    const upgradeTx = await proxy.connect(signer).upgradeToAndCall(
        newImplementationAddress,
        "0x" // 空数据，只升级
    );
    await upgradeTx.wait();

    // 4. 返回升级后的代理合约实例
    return await ethers.getContractAt(NewImplementationFactory.interface, proxyAddress);
}





// const { ethers, networkHelpers,  } = await network.connect();

async function deployNFTMarketPlatformFixture() {
    const ethers = ethersInstance;
    const [owner, feeRecipient, addr1, addr2,addr3,addr4] = await ethers.getSigners();
    const myNFTToken = await ethers.deployContract("MyNFTToken");
    // const nftMarketPlatform = await ethers.deployContract("NFTMarketPlatform", [feeRecipient]);

    // const nftMarketPlatform = await ethers.deployContract("NFTMarketPlatformUpgradeV1",
    //   [owner.address], // feeRecipient
    // );
    // console.log("ethersInstance:", ethersInstance);
    console.log("price:", ethers.parseEther("0.1"));
    const nftMarketPlatform = await ethers.getContractFactory("NFTMarketPlatformUpgradeV1");
    const nftMarketPlatformProxy = await deployUUPSProxy(
      nftMarketPlatform,
      [feeRecipient.address], // feeRecipient
      owner
    );
    // await nftMarketPlatform.waitForDeployment();
    
    // ✅ 关键：使用getContractAt获取完整实例
    const proxyAsLogic = await ethers.getContractAt("NFTMarketPlatformUpgradeV1", nftMarketPlatformProxy.target);
    return { nftMarketPlatformProxy, myNFTToken, proxyAsLogic, owner, feeRecipient, addr1, addr2, addr3,addr4};
}

describe("NFTMarketPlatform", function () {
    
    describe("Auction", function () {
        // 测试用例：成功创建拍卖
        it("Should create an Action successfully", async function () {
            const { nftMarketPlatformProxy, myNFTToken, owner, addr1 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            const ethers = ethersInstance;
            
            // console.log("myNFTToken address:", await myNFTToken.getAddress());
            // console.log("nftMarketPlatform address:", await nftMarketPlatform.getAddress());    
            // console.log("ethersInstance:", ethersInstance);
            const price = ethers.parseEther("0.1");
            // console.log("price:", price);

            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: price,
            });

            console.log("nftMarketPlatform:",nftMarketPlatformProxy);
            await myNFTToken.approve(nftMarketPlatformProxy.target, 1);
            
            const durationHours = 24;
            const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            await networkHelpers.time.setNextBlockTimestamp(now+1);
            const enTime = now + 1 + durationHours*60*60; // 1 minute from now
            console.log("enTime:", enTime);
            console.log("blockTime:", now);
            // await networkHelpers.time.advanceBlock();
            await expect(nftMarketPlatformProxy.createAuction(
                myNFTToken.target,// NFT 合约地址
                1,// 代币 ID
                ethers.parseEther("0.05"),// 起始价格 0.05 ETH
                durationHours// 持续时间 24 小时
            )).to.emit(nftMarketPlatformProxy, "AuctionCreated").withArgs(
                1,// 拍卖 ID
                owner.address,
                myNFTToken.target,
                1,
                ethers.parseEther("0.05"),
                enTime
            );
        });

        it("Should revert when creating auction with invalid parameters", async function () {
            const { nftMarketPlatformProxy, myNFTToken, owner } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            const ethers = ethersInstance;
            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatformProxy.target, 1);
            // 无效的 NFT 合约地址
            await expect(nftMarketPlatformProxy.createAuction(
                ethers.ZeroAddress,
                1,
                ethers.parseEther("0.05"),
                24
            )).to.be.revertedWith("Invalid NFT contract");
            // 起始价格为 0
            await expect(nftMarketPlatformProxy.createAuction(
                myNFTToken.target,
                1,
                0,
                24
            )).to.be.revertedWith("Start price must be greater than 0");
            // 持续时间小于 1 小时
            await expect(nftMarketPlatformProxy.createAuction(
                myNFTToken.target,
                1,
                ethers.parseEther("0.05"),
                0
            )).to.be.revertedWith("Duration must be greater than 1");
        });

        it("should place a bid on an auction",async function () {
            const ethers = ethersInstance;
            const { nftMarketPlatformProxy, myNFTToken, owner, addr1,addr2,addr3 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            let feeRecipientStartBalance = await ethers.provider.getBalance(await nftMarketPlatformProxy.feeRecipient())
            const fixedGasPrice = ethers.parseUnits("1", "gwei");
            
            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatformProxy.target, 1);
            
            const durationHours = 24;
            const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            await networkHelpers.time.setNextBlockTimestamp(now+1);
            const auction_id = await nftMarketPlatformProxy.createAuction(
                myNFTToken.target,// NFT 合约地址
                1,// 代币 ID
                ethers.parseEther("0.05"),// 起始价格 0.05 ETH
                durationHours// 持续时间 24 小时
            );

            let initialSellerBalance = await ethers.provider.getBalance(owner.address);
            console.log("initialSellerBalance:", initialSellerBalance);
            let aucation1 = await nftMarketPlatformProxy.getAuction(1);
            expect(aucation1.seller).to.equal(owner.address);
            expect(aucation1.nftContract).to.equal(myNFTToken.target);
            expect(aucation1.tokenId).to.equal(1);
            expect(aucation1.startPrice).to.equal(ethers.parseEther("0.05"));
            expect(aucation1.endTime).to.equal(now + 1 + durationHours*60*60);

            // addr1 出价 0.06 ETH
            await networkHelpers.time.setNextBlockTimestamp(now+2);

            const bidTx = await nftMarketPlatformProxy.connect(addr1).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.06"),
                    gasPrice: fixedGasPrice,
                    gasLimit: 100000n  // 指定 gas 限制
                }
            );
            const addr1ReceiptInBid = await bidTx.wait();
            const addr1GasUsedInBid = addr1ReceiptInBid!.gasUsed * fixedGasPrice;
            await expect(bidTx).to.emit(nftMarketPlatformProxy, "BidPlaced").withArgs(
                1, // 拍卖 ID
                addr1.address,
                ethers.parseEther("0.06")
            );

            // 验证最高出价和最高出价者
            const updatedAuction = await nftMarketPlatformProxy.getAuction(1);
            expect(updatedAuction.highestBid).to.equal(ethers.parseEther("0.06"));
            expect(updatedAuction.highestBidder).to.equal(addr1.address);
            
            // addr2 出价 0.07 ETH
            await networkHelpers.time.setNextBlockTimestamp(now+3);
            await expect(nftMarketPlatformProxy.connect(addr2).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.07")
                }
            )).to.emit(nftMarketPlatformProxy, "BidPlaced").withArgs(
                1, // 拍卖 ID
                addr2.address,
                ethers.parseEther("0.07")
            );

            // 验证最高出价和最高出价者
            const updatedAuction2 = await nftMarketPlatformProxy.getAuction(1);
            expect(updatedAuction2.highestBid).to.equal(ethers.parseEther("0.07"));
            expect(updatedAuction2.highestBidder).to.equal(addr2.address);

            // addr3 出价 0.065 ETH， 应该失败
            await networkHelpers.time.setNextBlockTimestamp(now+4);
            await expect(nftMarketPlatformProxy.connect(addr3).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.065")
                }
            )).to.be.revertedWith("There already is a higher or equal bid");

            networkHelpers.time.increaseTo(now + 5 + durationHours*60*60); // 增加时间到拍卖结束

            // addr2 尝试在拍卖结束后出价， 应该失败
            await expect(nftMarketPlatformProxy.connect(addr2).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.08")
                }
            )).to.be.revertedWith("Auction has ended");

            await expect(nftMarketPlatformProxy.connect(addr2).endAction(
                1 // 拍卖 ID
            )).to.emit(nftMarketPlatformProxy, "AuctionEnded").withArgs(
                1,
                addr2.address,
                ethers.parseEther("0.07")
            );

            // 验证 NFT 所有权已转移给最高出价者 addr2
            expect(await myNFTToken.ownerOf(1)).to.equal(addr2.address);
            // 验证卖家收到了款项（扣除市场费用后）
            const feePercent = await nftMarketPlatformProxy.platformFee();
            console.log("feePercent:", feePercent);
            const sellerProceeds = ethers.parseEther("0.07") * (10000n - feePercent) / 10000n;
            // 注意这里的余额检查可能需要根据具体实现调整
            expect(await ethers.provider.getBalance(owner.address)).to.equal(initialSellerBalance + sellerProceeds);
            // 验证市场合约收到了费用
            const feeRecipientBalance = await ethers.provider.getBalance(await nftMarketPlatformProxy.feeRecipient())-feeRecipientStartBalance;
            const expectedFee = ethers.parseEther("0.07") * feePercent / 10000n;
            expect(feeRecipientBalance).to.equal(expectedFee);
            // 验证之前的最高出价者 addr1 收到了退款
            const addr1Balance1 = await ethers.provider.getBalance(addr1.address);
            let withdrawBidTx = await nftMarketPlatformProxy.connect(addr1).withdrawBid(1, {
                gasPrice: fixedGasPrice,
                gasLimit: 100000n  // 指定 gas 限制
            });

            const addr1ReceiptInWithdraw = await withdrawBidTx.wait();
            const addr1GasUsedInWithdraw = addr1ReceiptInWithdraw!.gasUsed * fixedGasPrice;
            const addr1Balance2 = await ethers.provider.getBalance(addr1.address);
            expect(addr1Balance2).to.equal(addr1Balance1+ethers.parseEther("0.06")-addr1GasUsedInWithdraw); // 初始余额加上退款


        });

        it("should return one activate auction details",async function () {
            const { nftMarketPlatformProxy, myNFTToken, owner } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            const ethers = ethersInstance;
            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatformProxy.target, 1);
            
            const durationHours = 24;
            // const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            // await networkHelpers.time.setNextBlockTimestamp(now+1);
            await nftMarketPlatformProxy.createAuction(
                myNFTToken.target,// NFT 合约地址
                1,// 代币 ID
                ethers.parseEther("0.05"),// 起始价格 0.05 ETH
                durationHours// 持续时间 24 小时
            );



            // 铸造第二个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/2", {
                value: ethers.parseEther("0.02"),
            });
            await myNFTToken.approve(nftMarketPlatformProxy.target, 2);
            
            const durationHours2 = 33;
            // const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            // await networkHelpers.time.setNextBlockTimestamp(now+1);
            await nftMarketPlatformProxy.createAuction(
                myNFTToken.target,// NFT 合约地址
                2,// 代币 ID
                ethers.parseEther("0.02"),// 起始价格 0.02 ETH
                durationHours2// 持续时间 2 小时
            );
            
            // 修改第一个拍卖为未激活状态
            await networkHelpers.time.increase(durationHours * 60 * 60 + 1); // 增加时间到第一个拍卖结束
            await nftMarketPlatformProxy.endAction(1);
            
            const aucations = await nftMarketPlatformProxy.getActiveAuctions();
            expect(aucations.length).to.equal(1);
            const aucation_id = aucations[0];
            const aucationDetails = await nftMarketPlatformProxy.getAuction(aucation_id);
            expect(aucationDetails.tokenId).to.equal(2);
            expect(aucationDetails.nftContract).to.equal(myNFTToken.target);
            expect(aucationDetails.startPrice).to.equal(ethers.parseEther("0.02"));
        });

        it("should set and get platform fee",async function () {
            const { nftMarketPlatformProxy, proxyAsLogic, owner, addr1 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            
            // 默认平台费用应为 200 (2%)
            expect(await nftMarketPlatformProxy.platformFee()).to.equal(200n);
            
            // 非所有者尝试设置平台费用应失败
            // await expect(nftMarketPlatformProxy.connect(addr1).setPlatformFee(300)).to.be.revertedWithCustomError(proxyAsLogic, "OwnableUnauthorizedAccount").withArgs(addr1.address);
            await expect(nftMarketPlatformProxy.connect(addr1).setPlatformFee(300)).to.be.rejectedWith("Ownable: caller is not the owner");
            
            // 所有者设置平台费用为 300 (3.0%)
            await nftMarketPlatformProxy.connect(owner).setPlatformFee(300);
            expect(await nftMarketPlatformProxy.platformFee()).to.equal(300n);
            
            // 设置超过最大值的费用应失败
            await expect(nftMarketPlatformProxy.connect(owner).setPlatformFee(1500)).to.be.revertedWith("Fee too high");
        });

        it("should set and get fee recipient",async function () {
            const { nftMarketPlatformProxy, owner, feeRecipient, addr1, addr2, addr3 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            const ethers = ethersInstance;
            // 默认费用接收者应为部署时指定的地址
            expect(await nftMarketPlatformProxy.feeRecipient()).to.equal(feeRecipient.address);
            
            // 非所有者尝试设置费用接收者应失败
            // await expect(nftMarketPlatformProxy.connect(addr2).updateFeeRecipient(addr2.address)).to.be.revertedWithCustomError(nftMarketPlatformProxy, "OwnableUnauthorizedAccount").withArgs(addr2.address);
            await expect(nftMarketPlatformProxy.connect(addr2).updateFeeRecipient(addr2.address)).to.be.rejectedWith("Ownable: caller is not the owner");
            
            // 所有者设置费用接收者为 addr2
            await nftMarketPlatformProxy.connect(owner).updateFeeRecipient(addr2.address);
            expect(await nftMarketPlatformProxy.feeRecipient()).to.equal(addr2.address);
        });
    });
    
    






});
