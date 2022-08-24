const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// NOTE: We could also use "@openzeppelin/test-helpers".
// See: https://docs.openzeppelin.com/test-helpers/0.5/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe("PetShop contract", function () {

  async function deployPetShopFixture() {
    const PetShop = await ethers.getContractFactory("PetShop");
    const accounts = await ethers.getSigners();

    // NOTE: This is an upgradeable contract which involves a proxy contract
    // and one or more logic contracts, so the way how it's deployed is a bit different.
    const petShop = await upgrades.deployProxy(PetShop);
    await petShop.deployed();
    return { PetShop, petShop, accounts };
  }

  describe("Deployment", function() {
    it("should initialize the NFT name and symbol", async function() {
      const { petShop } = await loadFixture(deployPetShopFixture);
      expect(await petShop.name()).to.equal("Pet Shop");
      expect(await petShop.symbol()).to.equal("PET");
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
