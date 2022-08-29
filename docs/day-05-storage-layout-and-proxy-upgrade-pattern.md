# The PetShop project, day 5: Understanding contract storage layout and proxy upgrade pattern

I'm going to upgrade the PetShop NFT again to introduce the following changes:

- Set a token supply limit, and stop minting new tokens if the limit is reached.
- Set a price for minting a token. The ethers charged for minting tokens will be deposited in the contract's address.
- Allow the contract owner to withdraw ethers from the contract.

## The first attempt (which fails)

My first attempt is to create a `PetShopV3.sol` file like the following:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PullPaymentUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "hardhat/console.sol";

contract PetShopV3 is ERC721URIStorageUpgradeable, PullPaymentUpgradeable, OwnableUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter private tokenIds;

    uint8 private constant VERSION = 3;
    uint256 public constant TOTAL_SUPPLY = 10_000;
    uint256 public constant MINT_PRICE = 0.08 ether;

    function initializeV3() reinitializer(VERSION) public {
        console.log("Initializing PetShop version %s...", VERSION);
        __PullPayment_init_unchained();
        __Ownable_init_unchained();
     }

    function mintToken(string calldata _tokenURI, address _to) external payable returns (uint256) {
        uint256 lastTokenId = tokenIds.current();
        require(lastTokenId < TOTAL_SUPPLY, "Max supply reached");
        require(msg.value == MINT_PRICE, "Transaction value did not equal the mint price");

        tokenIds.increment();
        uint256 newTokenId = tokenIds.current();
        _safeMint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        return newTokenId;
    }

    function withdrawPayments(address payable payee) public virtual override onlyOwner {
        super.withdrawPayments(payee);
    }

    function withdraw() external onlyOwner {
        _asyncTransfer(msg.sender, address(this).balance);
        withdrawPayments(payable(msg.sender));
    }

    function version() external pure returns (uint256) {
        return VERSION;
    }
}
```

Some notes about this implementation:

- I'm using two constants, `TOTAL_SUPPLY` and `MINT_PRICE`, to define the total token supply and the price for minting a token. I'm using `require()` to ensure that such conditions are satisfied. If not, `require()` will throw an error, which will cause the transaction to be reverted.
- I'm using [OpenZeppelin's `PullPaymentUpgradeable`](https://docs.openzeppelin.com/contracts/2.x/api/payment#PullPayment) to introduce a secure `withdrawPayments()` method into my PetShop NFT. This method implements a simple pull-payment strategy which is often considered best practice.
- I'm adding a new `withdraw()` method to withdraw all funds from the contract to the owner. I'm using the `onlyOwner` modifier (from OpenZeppelin's `OwnableUpgradeable`) to limit access to the withdraw methods so that they can be called by contract owner only.

Now update the fixture code of our test:

```js
async function deployPetShopFixture() {
  const PetShopV1 = await ethers.getContractFactory("PetShop");
  const petShopV1 = await upgrades.deployProxy(PetShopV1);
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

  const accounts = await ethers.getSigners();

  return {
    PetShop: PetShopV3,
    petShop: petShopV3,
    accounts: accounts,
  };
}
```

Now re-run the test. I know that the test case to mint token would fail because no ether is sent to the contract for minting a new token. But actually, the test failed in loading fixture:

```console
$ npx hardhat test
...
  1) PetShop contract
       Deployment
         should initialize the NFT name and symbol:
     Error: New storage layout is incompatible

@openzeppelin/contracts-upgradeable/security/PullPaymentUpgradeable.sol:30: Inserted `_escrow`
  > New variables should be placed after all existing inherited variables
      ...
```

To understand the error, we need to understand two things:

- [Layout of State Variables in Storage](https://docs.soliditylang.org/en/v0.8.16/internals/layout_in_storage.html)
- [Proxy Upgrade Pattern used by OpenZeppelin](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)

## Contract storage layout

A smart contract deployed on the blockchain is composed of two things:

- Business logic, represented as EVM bytecode, compiled from Solidity source file.
- Contract state, represented as the contract's state variables, recorded in the contract's persistent storage.

We can consider that each contract has a dedicated storage space which is an immense, sparse mapping from `uint256` to a 32-byte slot. It can be roughly expressed as below:

```solidity
mapping(uint256 => bytes32) slots;
```

The key, which is of type `uint256`, is called the slot number. The value, which is not really of type `bytes32` but actually a free 32-byte-long space, is used to hold the packed data of the state variables. The state variables will be packed and layed out into this mapping [following some rules as defined in the Solidity language specification](https://docs.soliditylang.org/en/v0.8.16/internals/layout_in_storage.html). The key takeaways are:

- Starting from storage slot 0, state variables will be stored in the order of their declaration, packed according to some rules.
- Starting from storage slot 0, each variable type (value type or reference type) will occupy a fixed number of bytes. For mappings and dynamically-sized array types, whose size is unpredictable, they will occupy only 32 bytes with regards to the rules above, and the elements they contain are stored starting at a different storage slot that is computed using a Keccak-256 hash.

So the storage space is a lot similar to the memory space of a C++ or Java program: It is divided into two parts: A *stack* and a *heap*:

- The *stack* is used for static allocation. In the *stack*, state variables are packed and layed out in their declaration order starting from slot 0.
- The *heap* is used for dynamic allocation (for mappings and dynamic arrays like strings and bytes). Instead of sequencial allocation, slots in the *heap* are discontinuously allocated where the slot number is usually calculated from some Keccak-256 hash.

One important thing to notice is that, at compile time, a contract will have a fixed stack layout in its storage.

Another important rule is defined for contract inheritance:

> For contracts that use inheritance, the ordering of state variables is determined by the [C3-linearized](https://en.wikipedia.org/wiki/C3_linearization) order of contracts starting with the most base-ward contract.

Back to our PetShop contract. In version 2, our contract has one base contract, `ERC721URIStorageUpgradeable`, and contains one single state variable, `tokenIds`, which is a `uint256` counter. Suppose `ERC721URIStorageUpgradeable` needs `N` slots for its state variables. Our PetShop's storage *stack* layout will look like the following:

| Key: Slot Number      | Value: Slot Content                                |
| --------------------- | -------------------------------------------------- |
| 0 ~ N - 1             | State variables from `ERC721URIStorageUpgradeable` |
| N                     | `tokenIds` from `PetShopV2`                        |

While in `PetShopV3`, we added two base contracts: `PullPaymentUpgradeable` and `OwnableUpgradeable`. Suppose they need `M` and `P` slots respectively for their state variables. The *stack* layout will now become:

| Key: Slot Number      | Value: Slot Content                                |
| --------------------- | -------------------------------------------------- |
| 0 ~ N - 1             | State variables from `ERC721URIStorageUpgradeable` |
| N ~ N + M - 1         | State variables from `PullPaymentUpgradeable`      |
| N + M ~ N + M + P - 1 | State variables from `OwnableUpgradeable`          |
| N + M + P             | `tokenIds` from `PetShopV3`                        |

We can see that, to upgrade to PetShop version 3, the storage layout of our contract will change.

## The proxy upgrade pattern

To understand why this is disallowed, we will need to understand [the proxy upgrade pattern used by OpenZeppelin](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies).

Here's the key takeaway:

> It is up to the user to have new versions of a logic contract extend previous versions, or otherwise guarantee that the storage hierarchy is always appended to but not modified.

## The solution

So, we will take special care to ensure that, our new version of PetShop contract will have a compatible storage layout with the previous version. This means, we will need to make sure that storage slot `0` up to `N` will always hold the same state variables. Following is what we could achieve:

| Key: Slot Number      | Value: Slot Content                                |
| --------------------- | -------------------------------------------------- |
| 0 ~ N - 1             | State variables from `ERC721URIStorageUpgradeable` |
| N                     | `tokenIds` from `PetShopBase_v3`                   |
| N + 1 ~ N + M         | State variables from `PullPaymentUpgradeable`      |
| N + M + 1 ~ N + M + P | State variables from `OwnableUpgradeable`          |

And here's our `PetShopV3.sol`:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PullPaymentUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

/// @dev This base class duplicates all state variables of `PetShopV2`.
abstract contract PetShopBaseV3 is ERC721URIStorageUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter internal tokenIds;
}

contract PetShopV3 is PetShopBaseV3, PullPaymentUpgradeable, OwnableUpgradeable {
    // NOTE: The `using` directive is not inherited. In order to call methods on `tokenIds`,
    // we will need to repeat the `using` directive here.
    using CountersUpgradeable for CountersUpgradeable.Counter;

    uint8 private constant VERSION = 3;
    uint256 public constant TOTAL_SUPPLY = 10_000;
    uint256 public constant MINT_PRICE = 0.08 ether;

    function initializeV3() reinitializer(VERSION) public {
        console.log("Initializing PetShop version %s...", VERSION);
        __PullPayment_init_unchained();
        __Ownable_init_unchained();
    }

    function mintToken(string calldata _tokenURI, address _to) external payable returns (uint256) {
        uint256 lastTokenId = tokenIds.current();
        require(lastTokenId < TOTAL_SUPPLY, "Max supply reached");
        require(msg.value == MINT_PRICE, "Transaction value did not equal the mint price");

        tokenIds.increment();
        uint256 newTokenId = tokenIds.current();
        _safeMint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        return newTokenId;
    }

    function withdrawPayments(address payable payee) public virtual override onlyOwner {
        super.withdrawPayments(payee);
    }

    function version() external pure returns (uint8) {
        return VERSION;
    }
}
```

Here is the idea:

- We introduce a base contract `PetShopBaseV3` to replicate the storage layout in our previous version of PetShop.
- We make this base contract the *very first* base contract of our `PetShopV3`.
- We declare `PullPaymentUpgradeable` and `OwnableUpgradeable` as our second and third base contract.

By doing so, we managed to keep the storage layout compatibility.

Re-run the test. Now we will get the error as expected:

```console
$ npx hardhat test

  PetShop contract
    Deployment
Upgrading PetShop to version 2...
Upgrading PetShop to version 3...
      ✔ should initialize the NFT name and symbol (1910ms)
      ✔ should upgrade proxy to version 3
    Transactions
      1) should mint NFTs

  2 passing (2s)
  1 failing

  1) PetShop contract
       Transactions
         should mint NFTs:
     Error: VM Exception while processing transaction: reverted with reason string 'Transaction value did not equal the mint price'
    at PetShopV3.mintToken (contracts/PetShopV3.sol:30)
    ...
```

## Update the PetShop test

It's easy to fix our test. We will also check that:

- After some tokens are minted successfully, ethers sent to the contract should be deposit in its own balance.
- Sending no ether to mint a token should fail.
- Sending not enough ether to mint a token should fail.
- Sending too much ether to mint a token should fail.

```js
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

});
```

We will add some more test cases to test:

- Contract owner can withdraw all the funds.
- A non-owner account cannot withdraw funds.

```js
describe("Transactions", function() {

  // ...

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
```

Now run the test:

```console
$ npx hardhat test

  PetShop contract
    Deployment
Initializing PetShop...
Upgrading PetShop to version 2...
Initializing PetShop version 2...
Upgrading PetShop to version 3...
Initializing PetShop version 3...
      ✔ should initialize the NFT name and symbol (3247ms)
      ✔ should upgrade proxy to version 3
    Transactions
      ✔ should mint NFTs if value sent equal mint price (192ms)
      ✔ should revert if send no ether (65ms)
      ✔ should revert if send less ether
      ✔ should revert if send to much ether
      ✔ should not allow non-owner to withdraw funds (140ms)
      ✔ should allow owner to withdraw funds (190ms)

  8 passing (4s)
```

## Create a task to upgrade the PetShop NFT

Now we create a new task to upgrade the PetShop NFT to version 3:

```js
task("petshop-upgrade-v3", "Upgrades PetShop NFT to version 3")
  .addParam("address", "The contract address")
  .setAction(async (taskArgs) => {
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address} (balance: ${await deployer.getBalance()})`);

    const proxyAddress = taskArgs.address;

    // Verify the current version.
    const petShop = await loadNFTContract("PetShopV2", proxyAddress);
    const currentVersion = await petShop.version();
    if (currentVersion !== 2) {
      throw new Error(`Current version should be 2 but got ${currentVersion}`);
    }

    // Upgrade to next version.
    console.log(`Upgrading proxy contract (${proxyAddress}) to version 3...`);
    const PetShopV3 = await ethers.getContractFactory("PetShopV3");
    const petShopV3 = await upgrades.upgradeProxy(proxyAddress, PetShopV3);
    await petShopV3.initializeV3();
    console.assert(petShopV3.address === proxyAddress, "Proxy contract address should not change.");

    const name = await petShopV3.name();
    const symbol = await petShopV3.symbol();
    const version = await petShopV3.version();
    console.log(`Upgraded contract ${name} (symbol: ${symbol}) to version ${version}.`);
  });
```

Start the local Hardhat network daemon and try to deploy and upgrade the contract:

```console
$ npx hardhat petshop-deploy --network localhost
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (balance: 10000000000000000000000)
Deployed PetShop at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Querying NFT: name = Pet Shop; symbol = PET

$ npx hardhat petshop-upgrade-v2 --network localhost \
    --address 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (balance: 9999996833903902260960)
Upgrading proxy contract (0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0) to version 2...
Upgraded contract Pet Shop (symbol: PET) to version 2.

$ npx hardhat petshop-upgrade-v3 --network localhost \
    --address 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (balance: 9999995224069230583548)
Loaded NFT contract PetShopV2 from 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0: Pet Shop (PET)
Upgrading proxy contract (0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0) to version 3...
Upgraded contract Pet Shop (symbol: PET) to version 3.
```

## Upgrade the PetShop NFT on Goerli testnet

On Goerli testnet, our contract is already in version 2. Try to upgrade it to version 3:

```console
$ npx hardhat petshop-upgrade-v3 --network goerli \
    --address 0xff27228e6871eaB08CD0a14C8098191279040c13
Deployer: 0xCc4c8184CC4A5A03babC13D832cEE3E41bE92d08 (balance: 725010088175111518)
Loaded NFT contract PetShopV2 from 0xff27228e6871eaB08CD0a14C8098191279040c13: Pet Shop (PET)
Upgrading proxy contract (0xff27228e6871eaB08CD0a14C8098191279040c13) to version 3...
Upgraded contract Pet Shop (symbol: PET) to version 3.
```

Now our PetShop version 3 is live on Goerli testnet. If we try to mint a new token, it will fail because our `petshop-mint` task does not send any ether:

```console
$ npx hardhat petshop-mint --network goerli \
    --address 0xff27228e6871eaB08CD0a14C8098191279040c13 \
    --to      0xCc4c8184CC4A5A03babC13D832cEE3E41bE92d08 \
    --uri     https://petshop.example/nft/foo
Loaded contract from 0xff27228e6871eaB08CD0a14C8098191279040c13: Pet Shop (PET)
  * Sending tx...
An unexpected error occurred:

Error: cannot estimate gas; transaction may fail or may require manual gas limit ...
(reason="execution reverted: Transaction value did not equal the mint price", method="estimateGas", ...)
    at Logger.makeError ...
    ... {
  reason: 'execution reverted: Transaction value did not equal the mint price',
  code: 'UNPREDICTABLE_GAS_LIMIT',
  method: 'estimateGas',
  ...
}
```
