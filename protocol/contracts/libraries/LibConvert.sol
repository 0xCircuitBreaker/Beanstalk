/*
 SPDX-License-Identifier: MIT
*/

pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IBean.sol";
import "../interfaces/IWETH.sol";
import "./Utils/LibToolShed.sol";
import "./LibMarket.sol";
import "./LibAppStorage.sol";
import "./LibConvertUserData.sol";
import "./LibMetaCurve.sol";

/**
 * @author Publius
 * @title Lib Convert
**/
library LibConvert {

    using SafeMath for uint256;
    using LibConvertUserData for bytes;

    // function sellToPegAndAddLiquidity(uint256 beans, uint256 minLP)
    //     internal
    //     returns (uint256 lp, uint256 beansConverted)
    // {
    //     (uint256 ethReserve, uint256 beanReserve) = reserves();
    //     uint256 maxSellBeans = beansToPeg(ethReserve, beanReserve);
    //     require(maxSellBeans > 0, "Convert: P must be > 1.");
    //     uint256 sellBeans = calculateSwapInAmount(beanReserve, beans);
    //     if (sellBeans > maxSellBeans) sellBeans = maxSellBeans;

    //     (uint256 beansSold, uint256 wethBought) = LibMarket._sell(sellBeans, 1, address(this));
    //     (beansConverted,, lp) = LibMarket._addLiquidityWETH(wethBought,beans.sub(beansSold),1,1);
    //     require(lp >= minLP, "Convert: Not enough LP.");
    //     beansConverted = beansConverted + beansSold;
    // }

    function sellToPegAndAddLiquidity(bytes memory userData)
        internal
        returns (uint256 lp, uint256 beansConverted)
    {
        LibConvertUserData.SellToPegKind kind = userData.sellToPegKind();

        if (kind == LibConvertUserData.SellToPegKind.EXACT_CURVE_ADD_LP_IN_BEANS) {
            (lp, beansConverted) = _convertExactCurveAddLPInBeans(userData);
        } else if (kind == LibConvertUserData.SellToPegKind.EXACT_UNISWAP_SELL_BEANS_AND_ADD_LP) {
            (lp, beansConverted) = _convertExactUniswapSellBeansAndAddLP(userData);
        } 
        // else {
        //     _revert(Errors.UNHANDLED_EXIT_KIND);
        // }
    }

    function removeLPAndBuyToPeg(bytes memory userData)
        internal
        returns (uint256 beans, uint256 lpConverted)
    {
        LibConvertUserData.BuyToPegKind kind = userData.buyToPegKind();

        if (kind == LibConvertUserData.BuyToPegKind.EXACT_CURVE_LP_OUT_IN_BEANS) {
            (beans, lpConverted) = _convertExactCurveLPOutInBeans(userData);
        } else if (kind == LibConvertUserData.BuyToPegKind.EXACT_UNISWAP_REMOVE_BEAN_AND_ADD_LP) {
            (beans, lpConverted) = _convertExactUniswapBeansOutInLP(userData);
        } 
        // else {
        //     _revert(Errors.UNHANDLED_EXIT_KIND);
        // }
    }

    function removeLiquidityToBeanstalk(uint256 liqudity)
        private
        returns (uint256 beanAmount, uint256 ethAmount)
    {
        LibMarket.DiamondStorage storage ds = LibMarket.diamondStorage();
        (beanAmount, ethAmount) = IUniswapV2Router02(ds.router).removeLiquidity(
            ds.bean,
            ds.weth,
            liqudity,
            1,
            1,
            address(this),
            block.timestamp.add(1)
        );
    }

    function beansToPeg(uint ethBeanPool, uint beansBeanPool) internal view returns (uint256 beans) {
        (uint256 ethUSDCPool, uint256 usdcUSDCPool) = pegReserves();

        uint256 newBeans = LibToolShed.sqrt(ethBeanPool.mul(beansBeanPool).mul(usdcUSDCPool).div(ethUSDCPool));
        if (newBeans <= beansBeanPool) return 0;
           beans = newBeans - beansBeanPool;
        beans = beans.mul(10000).div(9985);
    }

    function lpToPeg() internal view returns (uint256 lp) {
        (uint e, uint b) = reserves();
        (uint y, uint x) = pegReserves();
        uint c = LibToolShed.sqrt(y*b*1e18/(x*e)).mul(1e9);
        if (c <= 1e18) return 0;
        uint num = e*(c.sub(1e18));
        uint denom = c.sub(1502253380070105);
        uint eth = num.div(denom);
        return eth.mul(totalLP()).div(e);
    }

    /**
     * Convert Function Selector Functions
    **/

    function _convertExactUniswapSellBeansAndAddLP(bytes memory userData) private returns (uint256 lp, uint256 beansConverted) {
        (uint256 beans, uint256 minLP) = userData.exactCurveAddLPInBeans();
        
        (uint256 ethReserve, uint256 beanReserve) = reserves();
        uint256 maxSellBeans = beansToPeg(ethReserve, beanReserve);
        require(maxSellBeans > 0, "Convert: P must be > 1.");
        uint256 sellBeans = calculateSwapInAmount(beanReserve, beans);
        if (sellBeans > maxSellBeans) sellBeans = maxSellBeans;

        (uint256 beansSold, uint256 wethBought) = LibMarket._sell(sellBeans, 1, address(this));
        (beansConverted,, lp) = LibMarket._addLiquidityWETH(wethBought,beans.sub(beansSold),1,1);
        require(lp >= minLP, "Convert: Not enough LP.");
        beansConverted = beansConverted + beansSold;
    }

    function _convertExactCurveAddLPInBeans(bytes memory userData) private returns (uint256 lp, uint256 beansConverted) {
        (uint256 beans, uint256 minLP) = userData.exactCurveAddLPInBeans();
        uint256[] memory amounts;
        amounts[0] = beans;
        lp = LibMetaCurve.addLiquidity(amounts, minLP);
        beansConverted = beans;
    }

    function _convertExactUniswapBeansOutInLP(bytes memory userData) private returns (uint256 beans, uint256 lpConverted) {
        (uint256 lp, uint256 minBeans) = userData.exactUniswapBeansOutInLP();
        lpConverted = lpToPeg();
        require(lpConverted > 0, "Convert: P must be < 1.");
        if (lpConverted > lp) lpConverted = lp;
        
        (uint256 beansRemoved, uint256 ethRemoved) = removeLiquidityToBeanstalk(lpConverted);
        (, uint256 boughtBeans) = LibMarket._buyWithWETH(1, ethRemoved, address(this));
        beans = beansRemoved.add(boughtBeans);
        require(beans >= minBeans, "Convert: Not enough Beans.");
    }

    function _convertExactCurveLPOutInBeans(bytes memory userData) private returns (uint256 beans, uint256 lpConverted) {
        (uint256 minLPAmountOut) = userData.exactCurveLPOutInBeans();
        beans = LibMetaCurve.removeLiquidityOneCoin(minLPAmountOut, 0, 0);
        lpConverted = minLPAmountOut;
    }

    /**
     * Shed
    **/

    function calculateSwapInAmount(uint256 reserveIn, uint256 amountIn)
        private
        pure
        returns (uint256)
    {
        return LibToolShed.sqrt(
            reserveIn.mul(amountIn.mul(3988000) + reserveIn.mul(3988009))
        ).sub(reserveIn.mul(1997)) / 1994;
    }

    function totalLP() private view returns (uint256) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        return IUniswapV2Pair(s.c.pair).totalSupply();
    }

    // (ethereum, beans)
    function reserves() private view returns (uint256, uint256) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(s.c.pair).getReserves();
        return (s.index == 0 ? reserve1 : reserve0, s.index == 0 ? reserve0 : reserve1);
    }

    // (ethereum, usdc)
    function pegReserves() private view returns (uint256, uint256) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(s.c.pegPair).getReserves();
        return (reserve1, reserve0);
    }

}
