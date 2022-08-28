// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

contract PetShop_v2 is ERC721URIStorageUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter private tokenIds;

    function initialize() initializer public {
        __ERC721_init("Pet Shop", "PET");
     }

    function mintToken(string calldata _tokenURI, address _to) external returns (uint256) {
        tokenIds.increment();
        uint256 newTokenId = tokenIds.current();
        _safeMint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        return newTokenId;
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}