const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// NOTE: We could also use "@openzeppelin/test-helpers".
// See: https://docs.openzeppelin.com/test-helpers/0.5/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe("PetShop contract", function () {

  async function deployPetShopFixture() {
    // Deploy a proxy contract with the very first version.
    let PetShopV1 = await ethers.getContractFactory("PetShop");
    let petShopV1 = await upgrades.deployProxy(PetShopV1);
    await petShopV1.deployed();
    const proxyAddress = petShopV1.address;

    console.log("Upgrading PetShop to version 2...");
    const PetShopV2 = await ethers.getContractFactory("PetShopV2");
    const petShopV2 = await upgrades.upgradeProxy(proxyAddress, PetShopV2);
    await petShopV2.initializeV2();

    console.log("Upgrading PetShop to version 3...");
    const PetShopV3 = await ethers.getContractFactory("PetShopV3");
    const petShopV3 = await upgrades.upgradeProxy(proxyAddress, PetShopV3);
    await petShopV3.initializeV3();

    // NOTE: Although the proxy contract address should not change, the two versions
    // of the contract have different ABI. We should return the latest version so that
    // we have access to the latest ABI.
    const accounts = await ethers.getSigners();
  
    return {
      PetShop: PetShopV3,
      petShop: petShopV3,
      accounts: accounts,
    };
  }

  describe("Deployment", function() {
    it("should initialize the NFT name and symbol", async function() {
      const { petShop } = await loadFixture(deployPetShopFixture);
      expect(await petShop.name()).to.equal("Pet Shop");
      expect(await petShop.symbol()).to.equal("PET");
    });

    it("should upgrade proxy to version 3", async function() {
      const { petShop } = await loadFixture(deployPetShopFixture);
      expect(await petShop.version()).to.equal(3);
    });
  });

  describe("Transactions", function() {
    it("should mint NFTs if value sent equal mint price", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);

      const someAccounts = accounts.slice(1, 4);
      for (let i = 0; i < someAccounts.length; i++) {
        const account = someAccounts[i];
        const tokenID = i + 1; // Token ID should start from 1.
        const tokenURI = `https://petshop.example/nft/${tokenID}`;
        await expect(
          petShop.connect(account).mintToken(tokenURI, account.address, {
            value: ethers.utils.parseEther("0.08"),
          })
        ).to.emit(petShop, "Transfer").withArgs(ZERO_ADDRESS, account.address, tokenID);
        expect(await petShop.tokenURI(tokenID)).to.equal(tokenURI);
        expect(await petShop.ownerOf(tokenID)).to.equal(account.address);
        expect(await petShop.balanceOf(account.address)).to.equal(1);
      }

      expect(await petShop.balanceOf(accounts[0].address)).to.equal(0);

      const actualBalance = await ethers.provider.getBalance(petShop.address);
      const expectedBalance = ethers.utils.parseEther("0.24");
      expect(actualBalance).to.equal(expectedBalance);
    });

    it("should revert if send no ether", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);
      const account = accounts[0];
      const tokenURI = "https://petshop.example/nft/foo";
      await expect(
        petShop.connect(account).mintToken(tokenURI, account.address)
      ).to.be.revertedWith("Transaction value did not equal the mint price");
      expect(await petShop.balanceOf(account.address)).to.equal(0);
      expect(await ethers.provider.getBalance(petShop.address)).to.equal(0);
    });

    it("should revert if send less ether", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);
      const account = accounts[0];
      const tokenURI = "https://petshop.example/nft/foo";
      await expect(
        petShop.connect(account).mintToken(tokenURI, account.address, {
          value: ethers.utils.parseEther("0.01"),
        })
      ).to.be.revertedWith("Transaction value did not equal the mint price");
      expect(await petShop.balanceOf(account.address)).to.equal(0);
      expect(await ethers.provider.getBalance(petShop.address)).to.equal(0);
    });

    it("should revert if send to much ether", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);
      const account = accounts[0];
      const tokenURI = "https://petshop.example/nft/foo";
      await expect(
        petShop.connect(account).mintToken(tokenURI, account.address, {
          value: ethers.utils.parseEther("0.99"),
        })
      ).to.be.revertedWith("Transaction value did not equal the mint price");
      expect(await petShop.balanceOf(account.address)).to.equal(0);
      expect(await ethers.provider.getBalance(petShop.address)).to.equal(0);
    });

    // Mint 5 tokens. This will deposit 5 * 0.08 ether in the contract.
    async function mintFiveTokens(petShop, account) {
      const mintPrice = ethers.utils.parseEther("0.08");
      const numTokens = 5;
      for (let i = 0; i < numTokens; i++) {
        const tokenID = i + 1; // Token ID should start from 1.
        const tokenURI = `https://petshop.example/nft/${tokenID}`;
        await expect(
          petShop.connect(account).mintToken(tokenURI, account.address, {
            value: mintPrice,
          })
        ).to.emit(petShop, "Transfer").withArgs(ZERO_ADDRESS, account.address, tokenID);
      }
      const balance = BigInt(mintPrice * numTokens);
      expect(await ethers.provider.getBalance(petShop.address)).to.equal(balance);
      return balance;
    }

    it("should not allow non-owner to withdraw funds", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);
      const account = accounts[1];
      await mintFiveTokens(petShop, account);
      await expect(
        petShop.connect(account).withdraw()
      ).to.be.reverted;
    });

    it("should allow owner to withdraw funds", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);
      const [owner, account] = accounts;
      const balance = await mintFiveTokens(petShop, account);
      await expect(
        petShop.connect(owner).withdraw()
      ).to.changeEtherBalances([petShop, owner], [-balance, balance]);
    });
  });

});
