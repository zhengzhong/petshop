// Load the compiled contract artifact, following Hardhat's project layout.
const CONTRACT_ARTIFACT = require("../artifacts/contracts/SimpleToken.sol/SimpleToken.json");

// We hard-code the address at which the contract is deployed.
// Depending on the network, make sure it has the correct value.
const CONTRACT_ADDRESS = "0xf7Df331661C4CFbbBb85Fca9c7b7C3657C50D783";


async function showBalances(accounts, tokenContract) {
  const formatRow = (cells, padChar) => {
    const paddings = [10, 42, 25, 10];
    return cells
      .map((cell, i) => `${cell}`.padEnd(paddings[i], padChar || ' '))
      .join(' | ');
  };

  const headings = ['Name', 'Address', 'ETH', 'Token (MST)'];
  console.log(formatRow(headings));
  console.log(formatRow(['', '', '', ''], '-'));
  for (const name of Object.keys(accounts)) {
    const account = accounts[name];
    const wei = await ethers.provider.getBalance(account.address);
    const eth = ethers.utils.formatEther(wei);
    const mst = await tokenContract.balanceOf(account.address);
    const cells = [name, account.address, eth, mst];
    console.log(formatRow(cells));
  }
  console.log(formatRow(['', '', '', ''], '-'));
}


async function measureTime(tag, asyncFn) {
  const startTime = new Date();
  const result = await asyncFn();
  const endTime = new Date();
  const seconds = (endTime - startTime) / 1000.0;
  console.log(`    * ${tag} - Used ${seconds.toFixed(2)} seconds`);
  return result;
}


async function transferTokens(from, to, amount, contract) {
  // Create and send a transaction to transfer tokens. Return a promise of `TransactionResponse`
  // which is published on the network but not necessarily mined.
  console.log(`Transferring ${amount} MST from ${from.address} to ${to.address}...`);
  const tx = await measureTime(
    'Creating tx',
    async () => contract.connect(from).transfer(to.address, amount)
  );

  // Wait for the transaction to be confirmed and included in the chain.
  console.log(`Waiting for tx ${tx.hash} to be mined...`);
  const receipt = await measureTime(
    'Waiting tx to be mined',
    () => tx.wait()
  );

  console.log(`Tx ${receipt.transactionHash} mined successfully.`);
  console.log(`    From / To     : ${receipt.from} => ${receipt.to}`);
  console.log(`    EIP-2718 Type : ${receipt.type}`);
  console.log(`    Status        : ${receipt.status}`);
  console.log(`    Block Number  : ${receipt.blockNumber}`);
  console.log(`    Block Hash    : ${receipt.blockHash}`);
  console.log(`    Gas Used      : ${receipt.gasUsed} (${receipt.effectiveGasPrice} wei / gas)`);

  // A successful transfer should emit a `Transfer` event.
  const event = receipt.events.find(event => event.event === 'Transfer');
  const [eventFrom, eventTo, eventValue] = event.args;
  console.log(`Found Transfer event: ${eventFrom} => ${eventTo}: ${eventValue}`);

  return receipt;
}


async function main() {
  console.log(`Current block number: ${await ethers.provider.getBlockNumber()}`);

  // Assume that we have at least 2 accounts.
  const [jason, orphee] = await ethers.getSigners();
  const accounts = {
    'Jason': jason,
    'Orphee': orphee,
  }

  // Construct the contract from its address and ABI.
  // NOTE: It's too hard to query the contract ABI from its address, so ABI must be provided.
  // See: https://github.com/ethers-io/ethers.js/issues/129
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CONTRACT_ARTIFACT.abi,
    ethers.provider
  );
  const tokenName = await contract.name();
  const tokenSymbol = await contract.symbol();
  const owner = await contract.owner();
  console.log(`Constructed token contract: ${tokenName} (${tokenSymbol}), owner is ${owner}`);

  // Query the account balances.
  await showBalances(accounts, contract);

  // Transfer tokens from Jason to Orphée.
  console.log('Transferring tokens from Jason to Orphée...');
  await transferTokens(jason, orphee, 16, contract);
  await showBalances(accounts, contract);

  // Transfer tokens back from Jason to Orphée.
  console.log('Transferring tokens from Orphée to Jason...');
  await transferTokens(orphee, jason, 16, contract);
  await showBalances(accounts, contract);

  console.log(`Current block number: ${await ethers.provider.getBlockNumber()}`);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
