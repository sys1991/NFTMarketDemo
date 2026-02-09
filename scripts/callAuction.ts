import { network } from "hardhat";
async function main() {
  /* ========== 连接网络 ========== */
  const connection = await network.connect();
  const { ethers,networkHelpers } = connection;

  const [owner, user1, user2,user3] = await ethers.getSigners();

  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);
  console.log("User3:", user3.address);

  /* ========== 合约地址（换成你自己的） ========== */

  const nftAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";//nft合约地址
  const marketAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";//市场合约地址

  /* ========== 绑定合约 ========== */

  const nft = await ethers.getContractAt(
    "MyNFTToken",
    nftAddress,
    owner
  );

  const market = await ethers.getContractAt(
    "NFTMarketPlatformUpgradeV1", // 或你的市场合约名
    marketAddress,
    owner
  );

  console.log("NFT:", nftAddress);
  console.log("Market:", marketAddress);

  /* =======================================================
      1️⃣ Mint NFT
  ======================================================= */

  console.log("\n=== Mint NFT ===");

  const mintTx = await nft.mint("https://example.com/metadata/1",{
  value: ethers.parseEther("0.01"), // 必须给钱
  });
  await mintTx.wait();

  console.log("Mint success");

  // 假设 tokenId 自增，从 0 或 1 开始
  const tokenId = await nft.getTotalSupply();

  console.log("TokenId:", tokenId.toString());

  /* =======================================================
      2️⃣ 授权 Market 操作 NFT
  ======================================================= */

  console.log("\n=== Approve NFT ===");

  const approveTx = await nft.approve(
    marketAddress,
    tokenId
  );

  await approveTx.wait();

  console.log("Approve success");

  /* =======================================================
      3️⃣ 创建拍卖
  ======================================================= */
  await market.updateFeeRecipient(user3.address);


  console.log("\n=== Create Auction ===");

  const startPrice = ethers.parseEther("1"); // 起拍价 1 ETH
  const duration = 1; // 1小时



  const createTx = await market.createAuction(
    nftAddress,
    tokenId,
    startPrice,
    duration
  );

  const receipt = await createTx.wait();

  console.log("Auction created");

  /* ========== 获取 auctionId（从 event）========== */

  let auctionId: bigint | null = null;

  for (const log of receipt!.logs) {
    try {
      const parsed = market.interface.parseLog(log);

      if (parsed?.name === "AuctionCreated") {
        auctionId = parsed.args.auctionId;
      }
    } catch {}
  }

  if (!auctionId) {
    throw new Error("Cannot find AuctionCreated event");
  }

  console.log("AuctionId:", auctionId.toString());

  /* =======================================================
      4️⃣ User1 出价
  ======================================================= */

  console.log("\n=== User1 Bid ===");

  const marketUser1 = market.connect(user1);

  const bid1 = await marketUser1.placeBid(auctionId, {
    value: ethers.parseEther("1.5"),
  });

  await bid1.wait();

  console.log("User1 bid success");

  /* =======================================================
      5️⃣ User2 出价
  ======================================================= */

  console.log("\n=== User2 Bid ===");

  const marketUser2 = market.connect(user2);

  const bid2 = await marketUser2.placeBid(auctionId, {
    value: ethers.parseEther("2"),
  });

  await bid2.wait();

  console.log("User2 bid success");

  /* =======================================================
      6️⃣ 等待拍卖结束
  ======================================================= */

  console.log("\n=== Fast forward time ===");

  // await ethers.provider.send("evm_increaseTime", [16000]);
  // await ethers.provider.send("evm_mine");
  await networkHelpers.time.increase(duration * 60 * 60 + 1);

  console.log("Time advanced");

  /* =======================================================
      7️⃣ 结束拍卖
  ======================================================= */

  console.log("\n=== End Auction ===");

  console.log(await market.getAuction(auctionId));
  

  console.log("owner balance:", await ethers.provider.getBalance(owner.address));
  console.log("user1 balance:", await ethers.provider.getBalance(user1.address));
  console.log("user2 balance:", await ethers.provider.getBalance(user2.address));
  const endTx = await market.endAction(auctionId);
  await endTx.wait();

  console.log("Auction ended");

  /* =======================================================
      8️⃣ 校验 NFT 归属
  ======================================================= */

  const newOwner = await nft.ownerOf(tokenId);

  console.log("\n=== Result ===");
  console.log("NFT New Owner:", newOwner);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});