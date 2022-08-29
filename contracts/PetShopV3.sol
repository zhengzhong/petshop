// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PullPaymentUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "hardhat/console.sol";

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

    function withdraw() external onlyOwner {
        _asyncTransfer(msg.sender, address(this).balance);
        withdrawPayments(payable(msg.sender));
    }

    function version() external pure returns (uint8) {
        return VERSION;
    }
}
