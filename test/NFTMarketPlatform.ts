import { expect } from "chai";
import { network } from "hardhat";
// import {time} from "@nomicfoundation/hardhat-network-helpers";

const { ethers, networkHelpers } = await network.connect();


async function deployNFTMarketPlatformFixture() {
    const [owner, feeRecipient, addr1, addr2,addr3] = await ethers.getSigners();
    const myNFTToken = await ethers.deployContract("MyNFTToken");
    const nftMarketPlatform = await ethers.deployContract("NFTMarketPlatform", [feeRecipient]);
    return { nftMarketPlatform, myNFTToken, owner, feeRecipient, addr1, addr2, addr3};
}


describe("NFTMarketPlatform", function () {

    describe("Auction", function () {
        // 测试用例：成功创建拍卖
        it("Should create an Action successfully", async function () {
            const { nftMarketPlatform, myNFTToken, owner, addr1 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);

            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatform.target, 1);
            
            const durationHours = 24;
            const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            await networkHelpers.time.setNextBlockTimestamp(now+1);
            const enTime = now + 1 + durationHours*60*60; // 1 minute from now
            console.log("enTime:", enTime);
            console.log("blockTime:", now);
            // await networkHelpers.time.advanceBlock();
            await expect(nftMarketPlatform.createAuction(
                myNFTToken.target,// NFT 合约地址
                1,// 代币 ID
                ethers.parseEther("0.05"),// 起始价格 0.05 ETH
                durationHours// 持续时间 24 小时
            )).to.emit(nftMarketPlatform, "AuctionCreated").withArgs(
                1,// 拍卖 ID
                owner.address,
                myNFTToken.target,
                1,
                ethers.parseEther("0.05"),
                enTime
            );
        });

        it("Should revert when creating auction with invalid parameters", async function () {
            const { nftMarketPlatform, myNFTToken, owner } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            
            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatform.target, 1);
            // 无效的 NFT 合约地址
            await expect(nftMarketPlatform.createAuction(
                ethers.ZeroAddress,
                1,
                ethers.parseEther("0.05"),
                24
            )).to.be.revertedWith("Invalid NFT contract");
            // 起始价格为 0
            await expect(nftMarketPlatform.createAuction(
                myNFTToken.target,
                1,
                0,
                24
            )).to.be.revertedWith("Start price must be greater than 0");
            // 持续时间小于 1 小时
            await expect(nftMarketPlatform.createAuction(
                myNFTToken.target,
                1,
                ethers.parseEther("0.05"),
                0
            )).to.be.revertedWith("Duration must be greater than 1");
        });

        it("should place a bid on an auction",async function () {
            const { nftMarketPlatform, myNFTToken, owner, addr1,addr2,addr3 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            let feeRecipientStartBalance = await ethers.provider.getBalance(await nftMarketPlatform.feeRecipient())
            const fixedGasPrice = ethers.parseUnits("1", "gwei");
            
            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatform.target, 1);
            
            const durationHours = 24;
            const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            await networkHelpers.time.setNextBlockTimestamp(now+1);
            const auction_id = await nftMarketPlatform.createAuction(
                myNFTToken.target,// NFT 合约地址
                1,// 代币 ID
                ethers.parseEther("0.05"),// 起始价格 0.05 ETH
                durationHours// 持续时间 24 小时
            );

            let initialSellerBalance = await ethers.provider.getBalance(owner.address);

            let aucation1 = await nftMarketPlatform.getAuction(1);
            expect(aucation1.seller).to.equal(owner.address);
            expect(aucation1.nftContract).to.equal(myNFTToken.target);
            expect(aucation1.tokenId).to.equal(1);
            expect(aucation1.startPrice).to.equal(ethers.parseEther("0.05"));
            expect(aucation1.endTime).to.equal(now + 1 + durationHours*60*60);

            // addr1 出价 0.06 ETH
            await networkHelpers.time.setNextBlockTimestamp(now+2);

            const bidTx = await nftMarketPlatform.connect(addr1).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.06"),
                    gasPrice: fixedGasPrice,
                    gasLimit: 100000n  // 指定 gas 限制
                }
            );
            const addr1ReceiptInBid = await bidTx.wait();
            const addr1GasUsedInBid = addr1ReceiptInBid!.gasUsed * fixedGasPrice;
            await expect(bidTx).to.emit(nftMarketPlatform, "BidPlaced").withArgs(
                1, // 拍卖 ID
                addr1.address,
                ethers.parseEther("0.06")
            );

            // 验证最高出价和最高出价者
            const updatedAuction = await nftMarketPlatform.getAuction(1);
            expect(updatedAuction.highestBid).to.equal(ethers.parseEther("0.06"));
            expect(updatedAuction.highestBidder).to.equal(addr1.address);
            
            // addr2 出价 0.07 ETH
            await networkHelpers.time.setNextBlockTimestamp(now+3);
            await expect(nftMarketPlatform.connect(addr2).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.07")
                }
            )).to.emit(nftMarketPlatform, "BidPlaced").withArgs(
                1, // 拍卖 ID
                addr2.address,
                ethers.parseEther("0.07")
            );

            // 验证最高出价和最高出价者
            const updatedAuction2 = await nftMarketPlatform.getAuction(1);
            expect(updatedAuction2.highestBid).to.equal(ethers.parseEther("0.07"));
            expect(updatedAuction2.highestBidder).to.equal(addr2.address);

            // addr3 出价 0.065 ETH， 应该失败
            await networkHelpers.time.setNextBlockTimestamp(now+4);
            await expect(nftMarketPlatform.connect(addr3).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.065")
                }
            )).to.be.revertedWith("There already is a higher or equal bid");

            networkHelpers.time.increaseTo(now + 5 + durationHours*60*60); // 增加时间到拍卖结束

            // addr2 尝试在拍卖结束后出价， 应该失败
            await expect(nftMarketPlatform.connect(addr2).placeBid(
                1, // 拍卖 ID
                {
                    value: ethers.parseEther("0.08")
                }
            )).to.be.revertedWith("Auction has ended");

            await expect(nftMarketPlatform.connect(addr2).endAction(
                1 // 拍卖 ID
            )).to.emit(nftMarketPlatform, "AuctionEnded").withArgs(
                1,
                addr2.address,
                ethers.parseEther("0.07")
            );

            // 验证 NFT 所有权已转移给最高出价者 addr2
            expect(await myNFTToken.ownerOf(1)).to.equal(addr2.address);
            // 验证卖家收到了款项（扣除市场费用后）
            const feePercent = await nftMarketPlatform.platformFee();
            const sellerProceeds = ethers.parseEther("0.07") * (10000n - feePercent) / 10000n;
            // 注意这里的余额检查可能需要根据具体实现调整
            expect(await ethers.provider.getBalance(owner.address)).to.equal(initialSellerBalance + sellerProceeds);
            // 验证市场合约收到了费用
            const feeRecipientBalance = await ethers.provider.getBalance(await nftMarketPlatform.feeRecipient())-feeRecipientStartBalance;
            const expectedFee = ethers.parseEther("0.07") * feePercent / 10000n;
            expect(feeRecipientBalance).to.equal(expectedFee);
            // 验证之前的最高出价者 addr1 收到了退款
            const addr1Balance1 = await ethers.provider.getBalance(addr1.address);
            let withdrawBidTx = await nftMarketPlatform.connect(addr1).withdrawBid(1, {
                gasPrice: fixedGasPrice,
                gasLimit: 100000n  // 指定 gas 限制
            });

            const addr1ReceiptInWithdraw = await withdrawBidTx.wait();
            const addr1GasUsedInWithdraw = addr1ReceiptInWithdraw!.gasUsed * fixedGasPrice;
            const addr1Balance2 = await ethers.provider.getBalance(addr1.address);
            expect(addr1Balance2).to.equal(addr1Balance1+ethers.parseEther("0.06")-addr1GasUsedInWithdraw); // 初始余额加上退款


        });

        it("should return one activate auction details",async function () {
            const { nftMarketPlatform, myNFTToken, owner } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            
            // 铸造一个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/1", {
                value: ethers.parseEther("0.01"),
            });
            await myNFTToken.approve(nftMarketPlatform.target, 1);
            
            const durationHours = 24;
            // const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            // await networkHelpers.time.setNextBlockTimestamp(now+1);
            await nftMarketPlatform.createAuction(
                myNFTToken.target,// NFT 合约地址
                1,// 代币 ID
                ethers.parseEther("0.05"),// 起始价格 0.05 ETH
                durationHours// 持续时间 24 小时
            );



            // 铸造第二个 NFT 并批准市场合约
            await myNFTToken.mint("https://example.com/metadata/2", {
                value: ethers.parseEther("0.02"),
            });
            await myNFTToken.approve(nftMarketPlatform.target, 2);
            
            const durationHours2 = 33;
            // const now = (await ethers.provider.getBlock("latest"))!.timestamp;
            // await networkHelpers.time.setNextBlockTimestamp(now+1);
            await nftMarketPlatform.createAuction(
                myNFTToken.target,// NFT 合约地址
                2,// 代币 ID
                ethers.parseEther("0.02"),// 起始价格 0.02 ETH
                durationHours2// 持续时间 2 小时
            );
            
            // 修改第一个拍卖为未激活状态
            await networkHelpers.time.increase(durationHours * 60 * 60 + 1); // 增加时间到第一个拍卖结束
            await nftMarketPlatform.endAction(1);
            
            const aucations = await nftMarketPlatform.getActiveAuctions();
            expect(aucations.length).to.equal(1);
            const aucation_id = aucations[0];
            const aucationDetails = await nftMarketPlatform.getAuction(aucation_id);
            expect(aucationDetails.tokenId).to.equal(2);
            expect(aucationDetails.nftContract).to.equal(myNFTToken.target);
            expect(aucationDetails.startPrice).to.equal(ethers.parseEther("0.02"));
        });

        it("should set and get platform fee",async function () {
            const { nftMarketPlatform, owner, addr1 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            
            // 默认平台费用应为 200 (2%)
            expect(await nftMarketPlatform.platformFee()).to.equal(200n);
            
            // 非所有者尝试设置平台费用应失败
            // await expect(nftMarketPlatform.connect(addr1).setPlatformFee(300)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(nftMarketPlatform.connect(addr1).setPlatformFee(300)).to.be.revertedWithCustomError(nftMarketPlatform, "OwnableUnauthorizedAccount").withArgs(addr1.address);
            
            // 所有者设置平台费用为 300 (3.0%)
            await nftMarketPlatform.connect(owner).setPlatformFee(300);
            expect(await nftMarketPlatform.platformFee()).to.equal(300n);
            
            // 设置超过最大值的费用应失败
            await expect(nftMarketPlatform.connect(owner).setPlatformFee(1500)).to.be.revertedWith("Fee too high");
        });

        it("should set and get fee recipient",async function () {
            const { nftMarketPlatform, owner, feeRecipient, addr1, addr2, addr3 } = await networkHelpers.loadFixture(deployNFTMarketPlatformFixture);
            
            // 默认费用接收者应为部署时指定的地址
            expect(await nftMarketPlatform.feeRecipient()).to.equal(feeRecipient.address);
            
            // 非所有者尝试设置费用接收者应失败
            await expect(nftMarketPlatform.connect(addr2).updateFeeRecipient(addr2.address)).to.be.revertedWithCustomError(nftMarketPlatform, "OwnableUnauthorizedAccount").withArgs(addr2.address);
            
            // 所有者设置费用接收者为 addr2
            await nftMarketPlatform.connect(owner).updateFeeRecipient(addr2.address);
            expect(await nftMarketPlatform.feeRecipient()).to.equal(addr2.address);
        });
    });
    
    






});
