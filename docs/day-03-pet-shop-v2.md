# The PetShop project, day 3: Upgrading the PetShop NFT

On the third day, I'm going to upgrade my PetShop NFT to version 2.

## Create PetShop version 2

In PetShop version 2, I'm going to introduce 2 minor changes:

- In `mintToken()` method, I'll call `_safeMint()` instead of `_mint()`. The `_safeMint()` method performs some extra checks before minting an NFT: The token ID must not exist, and if the receiving address is a smart contract, it must implement the IERC721Receiver interface.
- I'll add a new external method `version()` which returns the current version number of the contract.

To understand how upgradeable contract works, we need to know the [proxy upgrade pattern](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies) used by OpenZeppelin's upgradeable contracts library.

When we deploy our first version of PetShop NFT contract, we actually deployed a proxy contract and a logic contract:

- The proxy contract holds the address of the logic contract. It delegates all function calls to the logic contract.
- The logic contract's function will be executed in the context of the proxy's state. This means, all state variables declared in the logic contract are actually stored in the proxy's storage.

It is very important to understand this separation of execution code and state variables.

In Solidity, code that is inside a constructor or part of a global variable declaration is not part of a deployed contract's runtime bytecode. This code is executed only once, when the contract instance is deployed. As a consequence of this, the code within a logic contract's constructor will never be executed in the context of the proxy's state. To rephrase, proxies are completely oblivious to the existence of constructors. It's simply as if they weren't there for the proxy.

To solve this problem, logic contracts should move the code within the constructor to a regular "initializer" function, and have this function be called whenever the proxy links to this logic contract. Special care needs to be taken with this initializer function so that it can only be called once, which is one of the properties of constructors in general programming.

For each new version of the contract, we should provide a "reinitializer" function to do whatever is needed to migrate from the previous version. This reinitializer function should be called as part of the upgrade process, and be disabled when the upgrade completes.

Here's our `PetShopV2.sol`:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "hardhat/console.sol";

contract PetShopV2 is ERC721URIStorageUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter private tokenIds;

    uint8 private constant VERSION = 2;

    // The "reinitializer" function. It does nothing interesting, though.
    // I added this function to demonstrate a complete upgrade process.
    function initializeV2() reinitializer(VERSION) public {
        console.log("Initializing PetShop version %s...", VERSION);
    }

    function mintToken(string calldata _tokenURI, address _to) external returns (uint256) {
        tokenIds.increment();
        uint256 newTokenId = tokenIds.current();
        _safeMint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        return newTokenId;
    }

    function version() external pure returns (uint8) {
        return VERSION;
    }
}
```

We use the `reinitializer` modifier (from OpenZeppelin's `Initializable`), which ensures that the "reinitializer" function can be invoked at most once, and only if the contract hasn't been initialized to a greater version before.

In our test, we update `deployPetShopFixture()` to prepare PetShop version 2.

```js
async function deployPetShopFixture() {
  const PetShopV1 = await ethers.getContractFactory("PetShop");
  const petShopV1 = await upgrades.deployProxy(PetShopV1);
  await petShopV1.deployed();
  const proxyAddress = petShopV1.address;

  const PetShopV2 = await ethers.getContractFactory("PetShopV2");
  const petShopV2 = await upgrades.upgradeProxy(proxyAddress, PetShopV2);
  // Call the "reinitializer" function of this new version.
  await petShopV2.initializeV2();
  console.assert(petShopV2.address === proxyAddress, "Proxy address should not change.");

  const accounts = await ethers.getSigners();

  return {
    PetShop: PetShopV2,
    petShop: petShopV2,
    accounts: accounts,
  };
}
```

The old test cases should still pass. In addition, I'll add an extra test case for the `version()` method:

```js
describe("Deployment", function() {
  // ...
  it("should upgrade proxy to version 2", async function() {
    const { petShop } = await loadFixture(deployPetShopFixture);
    expect(await petShop.version()).to.equal(2);
  });
});
```

Now run the test:

```console
$ npx hardhat test
  PetShop contract
    Deployment
      ✔ should initialize the NFT name and symbol (2425ms)
      ✔ should upgrade proxy to version 2
    Transactions
      ✔ should mint NFTs (206ms)
```

## Create a task to upgrade the PetShop NFT

Now create a task to upgrade the PetShop NFT to version 2:

```js
task("petshop-upgrade-v2", "Upgrades PetShop NFT to version 2")
  .addParam("address", "The contract address")
  .setAction(async (taskArgs) => {
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address} (balance: ${await deployer.getBalance()})`);

    // See: https://docs.openzeppelin.com/upgrades-plugins/1.x/hardhat-upgrades
    console.log(`Upgrading proxy contract (${taskArgs.address}) to version 2...`);
    const PetShopV2 = await ethers.getContractFactory("PetShopV2");
    const petShopV2 = await upgrades.upgradeProxy(taskArgs.address, PetShopV2);
    await petShopV2.deployed();
    console.assert(petShopV2.address === taskArgs.address, "Proxy contract address should not change.");

    // Call the reinitializer function.
    await petShopV2.initializeV2();

    const name = await petShopV2.name();
    const symbol = await petShopV2.symbol();
    const version = await petShopV2.version();
    console.log(`Upgraded contract ${name} (symbol: ${symbol}) to version ${version}.`);
  });
```

Start the local Hardhat network daemon. Then in another terminal, try to deploy the contract version 1, and then upgrade it to version 2:

```console
$ npx hardhat petshop-deploy --network localhost
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (balance: 10000000000000000000000)
Deployed PetShop at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Querying NFT: name = Pet Shop; symbol = PET

$ npx hardhat petshop-upgrade-v2 --network localhost \
    --address 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (balance: 9999996884701105402650)
Upgrading proxy contract (0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0) to: PetShopV2
Upgraded contract Pet Shop (symbol: PET) to version 2.
```

## Upgrade the PetShop NFT on Goerli testnet

Previously I already have the PetShop NFT deployed on Goerli testnet. Its address is `0xff27228e6871eaB08CD0a14C8098191279040c13`, [viewable on Etherscan](https://goerli.etherscan.io/address/0xff27228e6871eaB08CD0a14C8098191279040c13). Now let's run the `petshop-upgrade-v2` task to upgrade it:

```console
$ npx hardhat petshop-upgrade-v2 --network goerli \
    --address 0xff27228e6871eaB08CD0a14C8098191279040c13
Deployer: 0xCc4c8184CC4A5A03babC13D832cEE3E41bE92d08 (balance: 735936919700656242)
Upgrading proxy contract (0xff27228e6871eaB08CD0a14C8098191279040c13) to: PetShopV2
Upgraded contract Pet Shop (symbol: PET) to version 2.
```

After the upgrade, on Etherscan we can see an `Upgraded` event was emitted:

![Etherscan: Upgraded event emitted](./images/day-03-etherscan-upgraded-event.png)

Note that the *proxy* contract address does not change during the upgrade. We will just create a new *logic* contract and update the proxy contract to point to it. Because the proxy contract is the one users or wallets interact with, such kind of upgrade is transparent to the token holders.

## Conclusion

This is my third day on Ethereum. The changes to the PetShop NFT are just minor ones. What's more important is to understand how to manage smart contract upgrades using OpenZeppelin's proxy upgrade pattern. Full source code can be found here: https://github.com/zhengzhong/petshop/releases/tag/day03

## References

- [Writing Upgradeable Contracts](https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable)
- [Proxy Upgrade Pattern](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)
