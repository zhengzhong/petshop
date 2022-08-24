const { task } = require("hardhat/config");
const { loadNFTContract, executeTx } = require("./utils");

const CONTRACT_NAME = "PetShop";

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

task("petshop-deploy", `Deploys the ${CONTRACT_NAME} NFT contract`)
  .setAction(async () => {
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address} (balance: ${await deployer.getBalance()})`);

    const Contract = await ethers.getContractFactory(CONTRACT_NAME);
    const contract = await upgrades.deployProxy(Contract);
    await contract.deployed();
    console.log(`Deployed ${CONTRACT_NAME} at: ${contract.address}`);

    const name = await contract.name();
    const symbol = await contract.symbol();
    console.log(`Querying NFT: name = ${name}; symbol = ${symbol}`);
  });

task("petshop-mint", `Mints a ${CONTRACT_NAME} NFT to an account`)
  .addParam("address", "The contract address")
  .addParam("to", "The receiving account's address")
  .addParam("uri", "The token's URI")
  .setAction(async (taskArgs) => {
    const contract = await ethers.getContractAt(CONTRACT_NAME, taskArgs.address);
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

task("petshop-check", `Checks a ${CONTRACT_NAME} NFT`)
  .addParam("address", "The contract address")
  .addParam("tokenid", "The token ID")
  .setAction(async (taskArgs) => {
    const contract = await loadNFTContract(CONTRACT_NAME, taskArgs.address);
    console.log(`Verifying token URI and owner of token #${taskArgs.tokenid}...`);
    const tokenURI = await contract.tokenURI(taskArgs.tokenid);
    const owner = await contract.ownerOf(taskArgs.tokenid);
    console.log(`  tokenURI = ${tokenURI}`);
    console.log(`  owner    = ${owner}`);
  });
