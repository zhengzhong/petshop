require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");
require('@openzeppelin/hardhat-upgrades');

require("./tasks/petshop");

// Load secrets from `.env` file into `process.env`.
require('dotenv').config();

const {
  GOERLI_PRIVATE_KEY_JASON,
  GOERLI_PRIVATE_KEY_ORPHEE,
  ALCHEMY_API_KEY,
  ETHERSCAN_API_KEY,
} = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.16",
  networks: {
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [GOERLI_PRIVATE_KEY_JASON, GOERLI_PRIVATE_KEY_ORPHEE],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
