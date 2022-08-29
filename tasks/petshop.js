const { task } = require("hardhat/config");
const { loadNFTContract, executeTx } = require("./utils");

task("balance", "Prints account's balance")
  .addOptionalParam("account", "The account's address")
  .setAction(async (taskArgs) => {
    let accounts = null;
    if (taskArgs.account) {
      accounts = [taskArgs.account];
    } else {
      console.log("Argument --account not provided: Showing all balances.");
      accounts = await ethers.getSigners();
    }
    for (const account of accounts) {
      const balance = await account.getBalance();
      const eth = ethers.utils.formatEther(balance);
      console.log(`${account.address} : ${eth} ETH`);
    }
  });

task("petshop-deploy", "Deploys the PetShop NFT contract")
  .setAction(async () => {
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address} (balance: ${await deployer.getBalance()})`);

    const Contract = await ethers.getContractFactory("PetShop");
    const contract = await upgrades.deployProxy(Contract);
    await contract.deployed();
    console.log(`Deployed PetShop at: ${contract.address}`);

    const name = await contract.name();
    const symbol = await contract.symbol();
    console.log(`Querying NFT: name = ${name}; symbol = ${symbol}`);
  });

task("petshop-upgrade-v2", "Upgrades PetShop NFT to version 2")
  .addParam("address", "The contract address")
  .setAction(async (taskArgs) => {
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address} (balance: ${await deployer.getBalance()})`);

    const proxyAddress = taskArgs.address;

    // See: https://docs.openzeppelin.com/upgrades-plugins/1.x/hardhat-upgrades
    console.log(`Upgrading proxy contract (${proxyAddress}) to version 2...`);
    const PetShopV2 = await ethers.getContractFactory("PetShopV2");
    const petShopV2 = await upgrades.upgradeProxy(proxyAddress, PetShopV2);
    // Call the reinitializer function.
    await petShopV2.initializeV2();
    console.assert(petShopV2.address === proxyAddress, "Proxy address should not change.");

    const name = await petShopV2.name();
    const symbol = await petShopV2.symbol();
    const version = await petShopV2.version();
    console.log(`Upgraded contract ${name} (symbol: ${symbol}) to version ${version}.`);
  });

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

task("petshop-mint", "Mints a PetShop NFT to an account")
  .addParam("address", "The contract address")
  .addParam("to", "The receiving account's address")
  .addParam("uri", "The token's URI")
  .setAction(async (taskArgs) => {
    const contract = await ethers.getContractAt("PetShopV3", taskArgs.address);
    const name = await contract.name();
    const symbol = await contract.symbol();
    console.log(`Loaded contract from ${taskArgs.address}: ${name} (${symbol})`);

    const accounts = await ethers.getSigners();
    const account = accounts.find(elem => elem.address === taskArgs.to);
    if (account === undefined) {
      throw new Error(`Could not find account with address: ${taskArgs.to}`);
    }

    const receipt = await executeTx(
      async () => contract.connect(account).mintToken(taskArgs.uri, account.address)
    );

    console.log("Looking for Transfer event from receipt...");
    const event = receipt.events.find(event => event.event === 'Transfer');
    const [from, to, tokenID] = event.args;
    console.log(`  event   = ${event.event}`);
    console.log(`  from    = ${from}`);
    console.log(`  to      = ${to}`);
    console.log(`  tokenID = ${tokenID}`);
  });

task("petshop-check", "Checks a PetShop NFT")
  .addParam("address", "The contract address")
  .addParam("tokenid", "The token ID")
  .setAction(async (taskArgs) => {
    const contract = await loadNFTContract("PetShopV3", taskArgs.address);
    console.log(`Verifying token URI and owner of token #${taskArgs.tokenid}...`);
    const tokenURI = await contract.tokenURI(taskArgs.tokenid);
    const owner = await contract.ownerOf(taskArgs.tokenid);
    console.log(`  tokenURI = ${tokenURI}`);
    console.log(`  owner    = ${owner}`);
  });
