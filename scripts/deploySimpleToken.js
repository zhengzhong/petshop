async function main() {
  // According to `hardhat.config.js` and the network we use,
  // this will give us an array of accounts.
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployer has a balance of: ${await deployer.getBalance()}`);

  const SimpleToken = await ethers.getContractFactory("SimpleToken");
  const simpleToken = await SimpleToken.deploy();
  await simpleToken.deployed();
  console.log(`Deployed SimpleToken at: ${simpleToken.address}`);
  console.log(`Deployer now has a balance of: ${await deployer.getBalance()}`);

  console.log(`Current block number: ${await ethers.provider.getBlockNumber()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
