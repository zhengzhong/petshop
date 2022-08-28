const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// NOTE: We could also use "@openzeppelin/test-helpers".
// See: https://docs.openzeppelin.com/test-helpers/0.5/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe("PetShop contract", function () {

  async function deployPetShopFixture() {
    const PetShop_v1 = await ethers.getContractFactory("PetShop");
    const petShop_v1 = await upgrades.deployProxy(PetShop_v1);
    await petShop_v1.deployed();

    const PetShop_v2 = await ethers.getContractFactory("PetShop_v2");
    const petShop_v2 = await upgrades.upgradeProxy(petShop_v1.address, PetShop_v2);
    await petShop_v2.deployed();

    console.assert(petShop_v1.address === petShop_v2.address, "Proxy contract address should not change.");

    // NOTE: Although the proxy contract address should not change, the two versions
    // of the contract have different ABI. We should return the latest version so that
    // we have access to the latest ABI.
    const accounts = await ethers.getSigners();
    return {
      PetShop: PetShop_v2,
      petShop: petShop_v2,
      accounts: accounts,
    };
  }

  describe("Deployment", function() {
    it("should initialize the NFT name and symbol", async function() {
      const { petShop } = await loadFixture(deployPetShopFixture);
      expect(await petShop.name()).to.equal("Pet Shop");
      expect(await petShop.symbol()).to.equal("PET");
    });

    it("should upgrade proxy to version 2", async function() {
      const { petShop } = await loadFixture(deployPetShopFixture);
      expect(await petShop.version()).to.equal(2);
    });
  });

  describe("Transactions", function() {
    it("should mint NFTs", async function() {
      const { petShop, accounts } = await loadFixture(deployPetShopFixture);

      const someAccounts = accounts.slice(1, 4);
      for (let i = 0; i < someAccounts.length; i++) {
        const account = someAccounts[i];
        const tokenID = i + 1; // Token ID should start from 1.
        const tokenURI = `https://petshop.example/nft/${tokenID}`;
        await expect(
          petShop.connect(account).mintToken(tokenURI, account.address)
        ).to.emit(petShop, "Transfer").withArgs(ZERO_ADDRESS, account.address, tokenID);
        expect(await petShop.tokenURI(tokenID)).to.equal(tokenURI);
        expect(await petShop.ownerOf(tokenID)).to.equal(account.address);
        expect(await petShop.balanceOf(account.address)).to.equal(1);
      }

      expect(await petShop.balanceOf(accounts[0].address)).to.equal(0);
    });
  });

});
