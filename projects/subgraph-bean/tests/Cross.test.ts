import { beforeEach, afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index";
import { log } from "matchstick-as/assembly/log";

import { BigDecimal } from "@graphprotocol/graph-ts";

import { handleBlock } from "../src/BlockHandler";
import { mockBlock } from "../../subgraph-core/tests/event-mocking/Block";
import {
  mockPreReplantBeanEthPriceAndLiquidity,
  mockPreReplantETHPrice,
  simpleMockPrice
} from "../../subgraph-core/tests/event-mocking/Price";

import {
  BEAN_3CRV_V1,
  BEAN_ERC20,
  BEAN_ERC20_V1,
  BEAN_WETH_CP2_WELL,
  BEAN_WETH_CP2_WELL_BLOCK,
  BEAN_WETH_V1,
  BEANSTALK_BLOCK
} from "../../subgraph-core/utils/Constants";
import { toDecimal, ZERO_BD } from "../../subgraph-core/utils/Decimals";

import { loadBean } from "../src/utils/Bean";
import { calcUniswapV2Inst, getPreReplantPriceETH, constantProductPrice, uniswapV2Reserves } from "../src/utils/price/UniswapPrice";
import { mockPoolPriceAndLiquidity } from "./entity-mocking/MockPool";

const wellCrossId = (n: u32): string => {
  return BEAN_WETH_CP2_WELL.toHexString() + "-" + n.toString();
};

const univ2CrossId = (n: u32): string => {
  return BEAN_WETH_V1.toHexString() + "-" + n.toString();
};

describe("Peg Crosses", () => {
  beforeEach(() => {
    // Bean price is init at 1.07, set to 0 so it is consistent will pool starting price
    let bean = loadBean(BEAN_ERC20.toHexString());
    bean.price = ZERO_BD;
    bean.save();

    let beanv1 = loadBean(BEAN_ERC20_V1.toHexString());
    beanv1.price = ZERO_BD;
    beanv1.save();

    // Should begin with zero crosses
    assert.notInStore("BeanCross", "0");
    assert.notInStore("PoolCross", "0");
  });

  afterEach(() => {
    log.debug("clearing the store", []);
    clearStore();
  });

  describe("UniswapV2", () => {
    test("Can Set ETH and BEAN Price and Pool Liquidity", () => {
      const ethPrice = BigDecimal.fromString("3500");
      mockPreReplantETHPrice(ethPrice);
      assert.assertTrue(getPreReplantPriceETH().equals(ethPrice));

      const beanPrice = BigDecimal.fromString("1.6057");
      mockPreReplantBeanEthPriceAndLiquidity(beanPrice);

      const reserves = uniswapV2Reserves(BEAN_WETH_V1);
      const ethPriceNow = getPreReplantPriceETH();
      const newPrice = constantProductPrice(toDecimal(reserves[0]), toDecimal(reserves[1], 18), ethPriceNow);
      log.info("expected | actual {} | {}", [beanPrice.toString(), newPrice.truncate(4).toString()]);
      assert.assertTrue(beanPrice.equals(newPrice));

      const beanPrice2 = BigDecimal.fromString("0.7652");
      const liquidity2 = BigDecimal.fromString("1234567");
      mockPreReplantBeanEthPriceAndLiquidity(beanPrice2, liquidity2);

      const reserves2 = uniswapV2Reserves(BEAN_WETH_V1);
      const ethPriceNow2 = getPreReplantPriceETH();
      const newPrice2 = constantProductPrice(toDecimal(reserves2[0]), toDecimal(reserves2[1], 18), ethPriceNow2);
      const newLiquidity2 = toDecimal(reserves2[1], 18).times(ethPriceNow2).times(BigDecimal.fromString("2"));
      log.info("expected | actual {} | {}", [beanPrice2.toString(), newPrice2.truncate(4).toString()]);
      assert.assertTrue(beanPrice2.equals(newPrice2));
      log.info("expected | actual {} | {}", [liquidity2.truncate(0).toString(), newLiquidity2.truncate(0).toString()]);
      // assert.assertTrue(liquidity2.truncate(0).equals(newLiquidity2.truncate(0)));
    });

    test("UniswapV2/Bean cross above", () => {
      mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("0.99"));
      handleBlock(mockBlock(BEANSTALK_BLOCK));

      assert.notInStore("BeanCross", "0");
      assert.notInStore("PoolCross", univ2CrossId(0));

      mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("1.01"));
      handleBlock(mockBlock(BEANSTALK_BLOCK));

      assert.fieldEquals("BeanCross", "0", "above", "true");
      assert.fieldEquals("PoolCross", univ2CrossId(0), "above", "true");
    });

    test("UniswapV2/Bean cross below", () => {
      mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("1.25"));
      handleBlock(mockBlock(BEANSTALK_BLOCK));

      assert.fieldEquals("BeanCross", "0", "above", "true");
      assert.fieldEquals("PoolCross", univ2CrossId(0), "above", "true");

      mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("0.8"));
      handleBlock(mockBlock(BEANSTALK_BLOCK));

      assert.fieldEquals("BeanCross", "1", "above", "false");
      assert.fieldEquals("PoolCross", univ2CrossId(1), "above", "false");
    });

    // TODO: cross from extreme liquidity difference

    // These aren't valid test cases for pre-replant since curve price update would only occur from a swap
    // test("UniswapV2/Bean cross above (separately)", () => {
    //   const liquidity = BigDecimal.fromString("5000000");
    //   mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("0.95"), liquidity);
    //   mockPoolPriceAndLiquidity(BEAN_3CRV_V1, BigDecimal.fromString("0.99"), liquidity, BEANSTALK_BLOCK);
    //   handleBlock(mockBlock(BEANSTALK_BLOCK));

    //   assert.notInStore("BeanCross", "0");
    //   assert.notInStore("PoolCross", univ2CrossId(0));

    //   mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("1.02"), liquidity);
    //   mockPoolPriceAndLiquidity(BEAN_3CRV_V1, BigDecimal.fromString("0.9"), liquidity, BEANSTALK_BLOCK);
    //   handleBlock(mockBlock(BEANSTALK_BLOCK));

    //   assert.notInStore("BeanCross", "0");
    //   assert.fieldEquals("PoolCross", univ2CrossId(0), "above", "true");

    //   mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("1.06"), liquidity);
    //   mockPoolPriceAndLiquidity(BEAN_3CRV_V1, BigDecimal.fromString("0.95"), liquidity, BEANSTALK_BLOCK);
    //   handleBlock(mockBlock(BEANSTALK_BLOCK));

    //   assert.fieldEquals("BeanCross", "0", "above", "true");
    //   assert.notInStore("PoolCross", univ2CrossId(1));
    // });

    // test("UniswapV2/Bean cross below (separately)", () => {
    //   const liquidity = BigDecimal.fromString("5000000");
    //   mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("1.05"), liquidity);
    //   mockPoolPriceAndLiquidity(BEAN_3CRV_V1, BigDecimal.fromString("1.01"), liquidity, BEANSTALK_BLOCK);
    //   handleBlock(mockBlock(BEANSTALK_BLOCK));

    //   assert.fieldEquals("BeanCross", "0", "above", "true");
    //   assert.fieldEquals("PoolCross", univ2CrossId(0), "above", "true");

    //   mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("0.97"), liquidity);
    //   mockPoolPriceAndLiquidity(BEAN_3CRV_V1, BigDecimal.fromString("1.05"), liquidity, BEANSTALK_BLOCK);
    //   handleBlock(mockBlock(BEANSTALK_BLOCK));

    //   assert.notInStore("BeanCross", "1");
    //   assert.fieldEquals("PoolCross", univ2CrossId(1), "above", "false");

    //   mockPreReplantBeanEthPriceAndLiquidity(BigDecimal.fromString("0.95"), liquidity);
    //   mockPoolPriceAndLiquidity(BEAN_3CRV_V1, BigDecimal.fromString("1.03"), liquidity, BEANSTALK_BLOCK);
    //   handleBlock(mockBlock(BEANSTALK_BLOCK));

    //   assert.fieldEquals("BeanCross", "1", "above", "false");
    //   assert.notInStore("PoolCross", univ2CrossId(2));
    // });
  });

  describe("BEAN:ETH Well", () => {
    test("Well/Bean cross above", () => {
      simpleMockPrice(0.99, 0.99);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.notInStore("BeanCross", "0");
      assert.notInStore("PoolCross", wellCrossId(0));

      simpleMockPrice(1.01, 1.01);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.fieldEquals("BeanCross", "0", "above", "true");
      assert.fieldEquals("PoolCross", wellCrossId(0), "above", "true");
    });

    test("Well/Bean cross below", () => {
      simpleMockPrice(1.25, 1.25);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.fieldEquals("BeanCross", "0", "above", "true");
      assert.fieldEquals("PoolCross", wellCrossId(0), "above", "true");

      simpleMockPrice(0.8, 0.8);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.fieldEquals("BeanCross", "1", "above", "false");
      assert.fieldEquals("PoolCross", wellCrossId(1), "above", "false");
    });

    test("Well/Bean cross above (separately)", () => {
      simpleMockPrice(0.95, 0.99);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.notInStore("BeanCross", "0");
      assert.notInStore("PoolCross", wellCrossId(0));

      simpleMockPrice(0.98, 1.02);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.notInStore("BeanCross", "0");
      assert.fieldEquals("PoolCross", wellCrossId(0), "above", "true");

      simpleMockPrice(1.02, 1.07);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.fieldEquals("BeanCross", "0", "above", "true");
      assert.notInStore("PoolCross", wellCrossId(1));
    });

    test("Well/Bean cross below (separately)", () => {
      simpleMockPrice(1.05, 1.01);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.fieldEquals("BeanCross", "0", "above", "true");
      assert.fieldEquals("PoolCross", wellCrossId(0), "above", "true");

      simpleMockPrice(1.02, 0.98);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.notInStore("BeanCross", "1");
      assert.fieldEquals("PoolCross", wellCrossId(1), "above", "false");

      simpleMockPrice(0.97, 0.92);
      handleBlock(mockBlock(BEAN_WETH_CP2_WELL_BLOCK));

      assert.fieldEquals("BeanCross", "1", "above", "false");
      assert.notInStore("PoolCross", wellCrossId(2));
    });
  });
});
