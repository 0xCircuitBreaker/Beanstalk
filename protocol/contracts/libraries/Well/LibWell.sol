/**
 * SPDX-License-Identifier: MIT
 **/

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import "../../C.sol";
import "./LibWellFunction.sol";
import "./LibWellBalance.sol";
import "./LibWellStorage.sol";
import "../LibSafeMath128.sol";
import "../../tokens/ERC20/WellToken.sol";
import "../Token/LibTransfer.sol";

/**
 * @author Publius
 * @title Lib Well
 **/
library LibWell {
    using SafeMath for uint256;
    using LibSafeMath128 for uint128;

    /**
     * Swap
     **/

    function getSwap(
        LibWellStorage.WellInfo calldata w,
        IERC20 iToken,
        IERC20 jToken,
        int256 dx
    ) internal view returns (int256 dy) {
        uint128[] memory balances = LibWellBalance.getBalances(w);
        (uint256 i, uint256 j) = LibWellTokens.getIJ(w.tokens, iToken, jToken);
        (, dy) = _getSwap(w.wellFunction, balances, i, j, dx);
    }

    function swap(
        LibWellStorage.WellInfo calldata w,
        IERC20 iToken,
        IERC20 jToken,
        int256 dx,
        int256 minDy
    ) internal returns (int256 dy) {
        bytes32 wh = LibWellStorage.computeWellHash(w);
        uint128[] memory balances = LibWellBalance.getBalancesAndUpdatePumps(wh, w.tokens.length, w.pumps);
        (uint256 i, uint256 j) = LibWellTokens.getIJ(w.tokens, iToken, jToken);
        (balances, dy) = _getSwap(
            w.wellFunction,
            balances,
            i,
            j,
            dx
        );
        LibWellBalance.updateBalances(wh, balances);
        require(dy >= minDy, "LibWell: too much slippage.");
        if (dx < 0)
            emit LibWellStorage.Swap(w.wellId, jToken, iToken, uint256(-dy), uint256(-dx));
        else
            emit LibWellStorage.Swap(w.wellId, iToken, jToken, uint256(dx), uint256(dy));
    }

    function _getSwap(
        bytes calldata wellFunction,
        uint128[] memory balances,
        uint256 i,
        uint256 j,
        int256 dx
    ) private view returns (uint128[] memory, int256) {
        uint256 d = LibWellFunction.getD(wellFunction, balances);
        balances[i] = dx > 0
            ? balances[i].add(uint128(dx))
            : balances[i].sub(uint128(-dx));
        uint256 yBefore = balances[j];
        balances[j] = LibWellFunction.getX(wellFunction, balances, j, d);
        int256 dy = int256(yBefore) - int256(balances[j]);
        return (balances, dy);
    }

    /**
     * Add Liquidity
     **/

    function addLiquidity(
        LibWellStorage.WellInfo calldata w,
        uint256[] memory amounts,
        uint256 minAmountOut,
        address recipient,
        LibTransfer.To toMode
    ) internal returns (uint256 amountOut) {
        bytes32 wh = LibWellStorage.computeWellHash(w);
        uint128[] memory balances = LibWellBalance.getBalancesAndUpdatePumps(wh, w.tokens.length, w.pumps);
        uint256 d1 = LibWellFunction.getD(w.wellFunction, balances);
        for (uint256 i; i < w.tokens.length; ++i)
            balances[i] = balances[i].add(uint128(amounts[i])); // Check
        LibWellBalance.updateBalances(wh, balances);
        uint256 d2 = LibWellFunction.getD(w.wellFunction, balances);
        amountOut = d2.sub(d1);
        require(amountOut >= minAmountOut, "LibWell: Not enough LP.");
        LibTransfer.mintToken(IBean(w.wellId), amountOut, recipient, toMode);
        emit LibWellStorage.AddLiquidity(w.wellId, amounts);
    }

    function getAddLiquidityOut(LibWellStorage.WellInfo calldata w, uint256[] memory amounts)
        internal
        view
        returns (uint256 amountOut)
    {
        uint128[] memory balances = LibWellBalance.getBalances(w);
        uint256 d1 = LibWellFunction.getD(w.wellFunction, balances);
        for (uint256 i; i < w.tokens.length; ++i)
            balances[i] = balances[i].add(uint128(amounts[i]));
        uint256 d2 = LibWellFunction.getD(w.wellFunction, balances);
        amountOut = d2.sub(d1);
    }

    /**
     * Remove Liquidity
     **/

    function removeLiquidity(
        LibWellStorage.WellInfo calldata w,
        uint256 lpAmountIn,
        uint256[] calldata minTokenAmountsOut,
        address recipient,
        LibTransfer.From fromMode
    ) internal returns (uint256[] memory tokenAmountsOut) {
        bytes32 wh = LibWellStorage.computeWellHash(w);
        uint128[] memory balances = LibWellBalance.getBalancesAndUpdatePumps(wh, w.tokens.length, w.pumps);
        uint256 d = LibWellFunction.getD(w.wellFunction, balances);
        tokenAmountsOut = new uint256[](w.tokens.length);
        lpAmountIn = LibTransfer.burnToken(IBean(w.wellId), lpAmountIn, recipient, fromMode);
        for (uint256 i; i < w.tokens.length; ++i) {
            tokenAmountsOut[i] = lpAmountIn.mul(balances[i]).div(d); // Downcasting ok because lpAmountIn <= d
            balances[i] = balances[i].sub(uint128(tokenAmountsOut[i]));
            require(
                tokenAmountsOut[i] >= minTokenAmountsOut[i],
                "LibWell: Not enough out."
            );
        }
        LibWellBalance.updateBalances(wh, balances);
        emit LibWellStorage.RemoveLiquidity(w.wellId, tokenAmountsOut);
    }

    function getRemoveLiquidityOut(LibWellStorage.WellInfo calldata w, uint256 lpAmountIn)
        internal
        view
        returns (uint256[] memory tokenAmountsOut)
    {
        uint128[] memory balances = LibWellBalance.getBalances(w);
        uint256 d = LibWellFunction.getD(w.wellFunction, balances);
        tokenAmountsOut = new uint256[](w.tokens.length);
        for (uint256 i; i < w.tokens.length; ++i) {
            tokenAmountsOut[i] = lpAmountIn.mul(balances[i]).div(d);
        }
    }

    /**
     * Remove Liquidity One Token
     **/

    function removeLiquidityOneToken(
        LibWellStorage.WellInfo calldata w,
        IERC20 token,
        uint256 lpAmountIn,
        uint256 minTokenAmountOut,
        address recipient,
        LibTransfer.From fromMode
    ) internal returns (uint256 tokenAmountOut) {
        bytes32 wh = LibWellStorage.computeWellHash(w);
        uint128[] memory balances = LibWellBalance.getBalancesAndUpdatePumps(wh, w.tokens.length, w.pumps);
        uint128 y;
        uint256 i = LibWellTokens.getIMem(w.tokens, token);
        lpAmountIn = LibTransfer.burnToken(IBean(w.wellId), lpAmountIn, recipient, fromMode);
        (tokenAmountOut, y) = _getRemoveLiquidityOneTokenOut(w, balances, i, lpAmountIn);
        require(tokenAmountOut >= minTokenAmountOut, "LibWell: out too low.");
        balances[i] = y;
        LibWellBalance.updateBalances(wh, balances); // should we just set 1?
        emit LibWellStorage.RemoveLiquidityOneToken(w.wellId, token, tokenAmountOut);
    }

    function getRemoveLiquidityOneTokenOut(
        LibWellStorage.WellInfo calldata w,
        IERC20 token,
        uint256 lpAmountIn
    ) internal view returns (uint256 tokenAmountOut) {
        uint128[] memory balances = LibWellBalance.getBalances(w);
        uint256 i = LibWellTokens.getI(w.tokens, token);
        (tokenAmountOut, ) = _getRemoveLiquidityOneTokenOut(w, balances, i, lpAmountIn);
    }

    function _getRemoveLiquidityOneTokenOut(
        LibWellStorage.WellInfo calldata w,
        uint128[] memory balances,
        uint256 i,
        uint256 lpAmountIn
    ) private view returns (uint256 tokenAmountOut, uint128 y) {
        uint256 d = LibWellFunction.getD(w.wellFunction, balances);
        d = d.sub(lpAmountIn, "LibWell: too much LP");
        y = LibWellFunction.getX(w.wellFunction, balances, i, d);
        tokenAmountOut = balances[i].sub(y);
    }

    /**
     * Remove Liquidity Imbalanced
     **/

    function removeLiquidityImbalanced(
        LibWellStorage.WellInfo calldata w,
        uint256 maxLPAmountIn,
        uint256[] calldata tokenAmountsOut,
        address recipient,
        LibTransfer.From fromMode
    ) internal returns (uint256 lpAmountIn) {
        require(fromMode <= LibTransfer.From.INTERNAL_TOLERANT, "Internal tolerant mode not supported");
        bytes32 wh = LibWellStorage.computeWellHash(w);
        uint128[] memory balances = LibWellBalance.getBalancesAndUpdatePumps(wh, w.tokens.length, w.pumps);
        (lpAmountIn, balances) = _getRemoveLiquidityImbalanced(w, balances, tokenAmountsOut);
        LibWellBalance.updateBalances(wh, balances);
        require(lpAmountIn <= maxLPAmountIn, "LibWell: in too high.");
        LibTransfer.burnToken(IBean(w.wellId), lpAmountIn, recipient, fromMode);
        emit LibWellStorage.RemoveLiquidity(w.wellId, tokenAmountsOut);
    }

    function getRemoveLiquidityImbalanced(
        LibWellStorage.WellInfo calldata w,
        uint256[] calldata tokenAmountsOut
    ) internal view returns (uint256 lpAmountIn) {
        uint128[] memory balances = LibWellBalance.getBalances(w);
        (lpAmountIn, ) = _getRemoveLiquidityImbalanced(w, balances, tokenAmountsOut);
    }

    function _getRemoveLiquidityImbalanced(
        LibWellStorage.WellInfo calldata w,
        uint128[] memory balances,
        uint256[] calldata tokenAmountsOut
    ) private view returns (uint256, uint128[] memory) {
        uint256 d1 = LibWellFunction.getD(w.wellFunction, balances);
        for (uint i; i < w.tokens.length; ++i) {
            balances[i] = balances[i].sub(uint128(tokenAmountsOut[i]));
        }
        uint256 d2 = LibWellFunction.getD(w.wellFunction, balances);
        return (d1.sub(d2), balances);
    }
}
