async function loadNFTContract(name, address) {
  const contract = await ethers.getContractAt(name, address);
  // We assume that the contract is ERC721 compliant.
  const nftName = await contract.name();
  const nftSymbol = await contract.symbol();
  console.log(`Loaded NFT contract ${name} from ${address}: ${nftName} (${nftSymbol})`);
  return contract;
}

async function executeTx(asyncTxFunc) {
  console.log('  * Sending tx...');
  const tx = await asyncTxFunc();
  console.log('  * Waiting tx to be mined...');
  const receipt = await tx.wait();
  console.log(`  * Tx executed, gas used: ${receipt.gasUsed}`);
  return receipt;
}

module.exports = {
  loadNFTContract,
  executeTx,
}
