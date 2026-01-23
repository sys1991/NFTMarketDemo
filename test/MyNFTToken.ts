import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

// Fixture to deploy the MyNFTToken contract
async function deployMyNFTTokenFixture() {
  const [owner, addr1, addr2] = await ethers.getSigners();
  const myNFTToken = await ethers.deployContract("MyNFTToken");
  return { myNFTToken, owner, addr1, addr2 };
}

describe("MyNFTToken", function () {
    //  测试用例：铸造 NFT，支付正确的 ETH 数量
    it("Should revert when minting without payment", async function () {
        const { myNFTToken} = await networkHelpers.loadFixture(deployMyNFTTokenFixture);

        await expect(myNFTToken.mint("https://example.com/metadata/1"))
            .to.be.revertedWith("Incorrect Ether value sent");
    });
    // 测试用例：铸造 NFT，支付不足的 ETH 数量
    it("Should revert with 'Incorrect Ether value sent' when minting without sufficient ETH", async function () {
        const { myNFTToken} = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        
        await expect(myNFTToken.mint("uri", { value: ethers.parseEther("0.005") }))
            .to.be.revertedWith("Incorrect Ether value sent");
    });
    // 测试用例：成功铸造 NFT 并触发事件
    it("Should emit Minted event when minting NFT", async function () {
        const { myNFTToken, owner } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);

        await expect(myNFTToken.mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        })).to.emit(myNFTToken, "Minted").withArgs(owner.address, 1, "https://example.com/metadata/1");
    });
    // 测试用例：成功铸造 NFT 并分配给调用者
    it("Should mint a new NFT and assign it to the caller", async function () {
        const { myNFTToken, owner } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        const mintTx = await myNFTToken.mint("https://example.com/metadata/1", {
        value: ethers.parseEther("0.01"),
        });
        await mintTx.wait();

        const ownerOfToken = await myNFTToken.ownerOf(1);
        expect(ownerOfToken).to.equal(owner.address);
    });

    
    // 测试用例：超过最大供应量时应回退
    it("Should revert with 'Max supply reached' when exceeding max supply", async function () {
        const { myNFTToken } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        // 假设最大供应量为 100
        const maxSupply = 100;
        // 预先铸造最大供应量的 NFT
        for (let i = 1; i <= maxSupply; i++) {
            await myNFTToken.mint(`https://example.com/metadata/${i}`, {
                value: ethers.parseEther("0.01"),
            });
        }
        // 尝试铸造超过最大供应量的 NFT
        await expect(myNFTToken.mint("https://example.com/metadata/10001", {
            value: ethers.parseEther("0.01"),
        })).to.be.revertedWith("Max supply reached");
    });


    // 测试用例：合约所有者提取资金
    it("Should allow the owner to withdraw funds", async function () {
        const { myNFTToken, owner } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        // 铸造一个 NFT 以产生合约余额
        await myNFTToken.mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        });
        // 记录 withdraw 前的余额
        const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

        // 使用固定的 gasPrice 便于计算
        const fixedGasPrice = ethers.parseUnits("1", "gwei");

        const withdrawTx = await myNFTToken.withdraw({ 
            gasPrice: fixedGasPrice,
            gasLimit: 100000  // 指定 gas 限制
        });
        const receipt = await withdrawTx.wait();
        const gasUsed = receipt!.gasUsed * fixedGasPrice;

        // 记录 withdraw 后的余额
        const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

        // 现在可以精确计算了
        expect(ownerBalanceAfter).to.equal(
            ownerBalanceBefore + ethers.parseEther("0.01") - gasUsed
        );
    });

    // 测试用例：非所有者尝试提取资金应回退
    it("Should revert when non-owner tries to withdraw funds", async function () {
        const { myNFTToken, addr1 } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        // 铸造一个 NFT 以产生合约余额
        await myNFTToken.mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        });

        await expect(myNFTToken.connect(addr1).withdraw())
            .to.be.revertedWithCustomError(myNFTToken, "OwnableUnauthorizedAccount").withArgs(addr1.address);
    });
    // 测试用例：验证总供应量是否正确更新
    it("Should return correct total supply after minting", async function () {
        const { myNFTToken } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        // 初始总供应量应为 0
        expect(await myNFTToken.getTotalSupply()).to.equal(0);

        // 铸造两个 NFT
        await myNFTToken.mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        });
        await myNFTToken.mint("https://example.com/metadata/2", {
            value: ethers.parseEther("0.01"),
        });

        // 总供应量应更新为 2
        expect(await myNFTToken.getTotalSupply()).to.equal(2);
    });
    // 测试用例：验证 token URI 是否正确存储和返回
    it("Should store and return correct token URI", async function () {
        const { myNFTToken } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);
        const tokenURI = "https://example.com/metadata/1";

        // 铸造一个 NFT
        await myNFTToken.mint(tokenURI, {
            value: ethers.parseEther("0.01"),
        });

        // 验证 token URI 是否正确存储
        expect(await myNFTToken.tokenURI(1)).to.equal(tokenURI);
    });
    // 测试用例：查询不存在的 token URI 应回退
    it("Should revert when querying tokenURI for non-existent token", async function () {
        const { myNFTToken } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);

        // await expect(myNFTToken.tokenURI(999))
        //     .to.be.revertedWith("ERC721Metadata: URI query for nonexistent token");
        await expect(myNFTToken.tokenURI(999))
            .to.be.revertedWithCustomError(myNFTToken, "ERC721NonexistentToken").withArgs(999);
    });
    // 测试用例：多个用户铸造 NFT
    it("Should allow multiple users to mint NFTs", async function () {
        const { myNFTToken, addr1, addr2 } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);

        // addr1 铸造 NFT
        await myNFTToken.connect(addr1).mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        });
        expect(await myNFTToken.ownerOf(1)).to.equal(addr1.address);

        // addr2 铸造 NFT
        await myNFTToken.connect(addr2).mint("https://example.com/metadata/2", {
            value: ethers.parseEther("0.01"),
        });
        expect(await myNFTToken.ownerOf(2)).to.equal(addr2.address);
    });
    // 测试用例：验证余额跟踪是否正确
    it("Should correctly track balances after multiple mints", async function () {
        const { myNFTToken, owner, addr1 } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);

        // owner 铸造两个 NFT
        await myNFTToken.mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        });
        await myNFTToken.mint("https://example.com/metadata/2", {
            value: ethers.parseEther("0.01"),
        });

        // addr1 铸造一个 NFT
        await myNFTToken.connect(addr1).mint("https://example.com/metadata/3", {
            value: ethers.parseEther("0.01"),
        });

        expect(await myNFTToken.balanceOf(owner.address)).to.equal(2);
        expect(await myNFTToken.balanceOf(addr1.address)).to.equal(1);
    });
    // 测试用例：验证合约支持的接口
    it("Should support ERC721 and ERC721Metadata interfaces", async function () {
        const { myNFTToken, owner } = await networkHelpers.loadFixture(deployMyNFTTokenFixture);

        // 铸造一个 NFT
        const mintTx = await myNFTToken.mint("https://example.com/metadata/1", {
            value: ethers.parseEther("0.01"),
        });
        await mintTx.wait();
        
        // 验证支持的接口
        expect(await myNFTToken.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
        expect(await myNFTToken.supportsInterface("0x5b5e139f")).to.equal(true); // ERC721Metadata
        expect(await myNFTToken.supportsInterface("0x12345678")).to.equal(false); // 不支持的接口
    });
});