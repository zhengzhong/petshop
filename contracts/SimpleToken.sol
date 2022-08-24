// SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.8.16;

import "hardhat/console.sol";

// This is the main building block for smart contracts.
contract SimpleToken {
    // Some string type variables to identify the token.
    string public name = "My Simple Token";
    string public symbol = "MST";

    // The fixed amount of tokens, stored in an unsigned integer type variable.
    uint256 public totalSupply = 1_000_000;

    // An address type variable is used to store ethereum accounts.
    address public owner;

    // A mapping is a key/value map. Here we store each account's balance.
    mapping(address => uint256) balances;

    // The Transfer event is emitted when someone transfers some token(s) to someone else.
    // The event helps off-chain applications understand what happens within the contract.
    event Transfer(address indexed _from, address indexed _to, uint256 _value);

    /**
     * Contract initialization.
     */
    constructor() {
        // The totalSupply is assigned to the transaction sender, which is the
        // account that is deploying the contract.
        balances[msg.sender] = totalSupply;
        owner = msg.sender;
    }

    /**
     * A function to transfer tokens.
     *
     * The `external` modifier makes a function *only* callable from *outside*
     * the contract.
     */
    function transfer(address to, uint256 amount) external {
        // Check if the transaction sender has enough tokens.
        require(balances[msg.sender] >= amount, "Not enough tokens");
        if (msg.sender != to) {
            console.log("Transferring %s tokens: %s => %s", amount, msg.sender, to);
            balances[msg.sender] -= amount;
            balances[to] += amount;
            // Notify off-chain applications of the transfer.
            emit Transfer(msg.sender, to, amount);
        }
    }

    /**
     * Read only function to retrieve the token balance of a given account.
     *
     * The `view` modifier indicates that it doesn't modify the contract's
     * state, which allows us to call it without executing a transaction.
     */
    function balanceOf(address account) external view returns (uint256) {
        console.log("Querying balance of %s: %s", account, balances[account]);
        return balances[account];
    }
}
