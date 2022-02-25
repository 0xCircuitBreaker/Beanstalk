/*
 SPDX-License-Identifier: MIT
*/

pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "../../farm/facets/ConvertFacet/ConvertFacet.sol";

/**
 * @author Publius
 * @title Mock Convert Facet
**/
contract MockConvertFacet is ConvertFacet {

    using SafeMath for uint256;

    event MockConvert(uint256 beansRemoved, uint256 stalkRemoved);

    function withdrawForConvertE(
        address token,
        uint32[] memory seasons,
        uint256[] memory amounts,
        uint256 maxTokens
    ) external {
        (uint256 beansRemoved, uint256 stalkRemoved) = _withdrawForConvert(token, seasons, amounts, maxTokens);
        emit MockConvert(beansRemoved, stalkRemoved);
    }
}
