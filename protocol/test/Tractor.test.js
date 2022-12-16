const { expect } = require("chai");
const { deploy } = require("../scripts/deploy.js");
const { deployPipeline } = require("../scripts/pipeline.js");
const { getAltBeanstalk, getBean, getUsdc } = require("../utils/contracts.js");
const { toBN, encodeAdvancedData } = require("../utils/index.js");
const { impersonateSigner } = require("../utils/signer.js");
const {
  getBlueprintHash,
  signBlueprint,
  getNormalBlueprintData,
  getAdvancedBlueprintData,
  generateCalldataCopyParams,
} = require("./utils/tractor.js");
const {
  EXTERNAL,
  INTERNAL,
  INTERNAL_EXTERNAL,
  INTERNAL_TOLERANT,
} = require("./utils/balances.js");
const {
  BEAN,
  BEAN_3_CURVE,
  TRI_CRYPTO_POOL,
  CRYPTO_REGISTRY,
  THREE_POOL,
  THREE_CURVE,
  STABLE_FACTORY,
  USDT,
  WETH,
  ZERO_ADDRESS,
} = require("./utils/constants.js");
const { to6, to18 } = require("./utils/helpers.js");
const { takeSnapshot, revertToSnapshot } = require("./utils/snapshot");

let user, user2, user3, publisher, owner;
let userAddress, ownerAddress, user2Address;

describe("Tractor", function () {
  before(async function () {
    [owner, user, user2, user3, publisher] = await ethers.getSigners();
    userAddress = user.address;
    user2Address = user2.address;
    const contracts = await deploy("Test", false, true);
    this.diamond = contracts.beanstalkDiamond;
    this.beanstalk = await getAltBeanstalk(this.diamond.address);
    this.tractor = await ethers.getContractAt(
      "TractorFacet",
      this.diamond.address
    );
    this.season = await ethers.getContractAt(
      "MockSeasonFacet",
      this.diamond.address
    );
    this.silo = await ethers.getContractAt(
      "MockSiloFacet",
      this.diamond.address
    );
    this.bean = await ethers.getContractAt("Bean", BEAN);
    this.tokenFacet = await ethers.getContractAt(
      "TokenFacet",
      this.diamond.address
    );
    this.farm = await ethers.getContractAt("FarmFacet", this.diamond.address);
    this.curve = await ethers.getContractAt("CurveFacet", this.diamond.address);
    this.beanMetapool = await ethers.getContractAt(
      "MockMeta3Curve",
      BEAN_3_CURVE
    );
    this.threeCurve = await ethers.getContractAt("IERC20", THREE_CURVE);

    await this.beanMetapool.set_A_precise("1000");
    await this.beanMetapool.set_virtual_price(to18("1"));
    await this.beanMetapool.set_balances([
      "1",
      ethers.utils.parseUnits("1", 12),
    ]);
    await this.beanMetapool.set_supply("0");

    await this.season.lightSunrise();
    await this.bean.connect(user).approve(this.silo.address, "100000000000");
    await this.bean.connect(user2).approve(this.silo.address, "100000000000");
    await this.bean.mint(userAddress, to6("10000"));
    await this.bean.mint(user2Address, to6("10000"));
    await this.silo.update(userAddress);
    await this.silo
      .connect(user)
      .deposit(this.bean.address, to6("1000"), EXTERNAL);
    await this.silo
      .connect(user2)
      .deposit(this.bean.address, to6("1000"), EXTERNAL);

    this.blueprint = {
      publisher: publisher.address,
      data: "0x1234567890",
      calldataCopyParams: [],
      maxNonce: 100,
      startTime: Math.floor(Date.now() / 1000) - 10 * 3600,
      endTime: Math.floor(Date.now() / 1000) + 10 * 3600,
    };
  });

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  describe("Publish Blueprint", function () {
    it("should not fail when signature is invalid #1", async function () {
      this.blueprint.signature = "0x0000";
      await expect(
        this.tractor.connect(publisher).publishBlueprint(this.blueprint)
      ).to.be.revertedWith("ECDSA: invalid signature length");
    });

    it("should not fail when signature is invalid #2", async function () {
      this.blueprint.signature =
        "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      await expect(
        this.tractor.connect(publisher).publishBlueprint(this.blueprint)
      ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
    });

    it("should not fail when signature is invalid #3", async function () {
      await signBlueprint(this.blueprint, user);
      await expect(
        this.tractor.connect(publisher).publishBlueprint(this.blueprint)
      ).to.be.revertedWith("TractorFacet: invalid signature");
    });

    it("should fail new blueprint", async function () {
      await signBlueprint(this.blueprint, publisher);
      await this.tractor.connect(publisher).publishBlueprint(this.blueprint);
    });
  });

  describe("Destroy Blueprint", function () {
    it("should not fail when signature is invalid #1", async function () {
      this.blueprint.signature = "0x0000";
      await expect(
        this.tractor.connect(publisher).destroyBlueprint(this.blueprint)
      ).to.be.revertedWith("ECDSA: invalid signature length");
    });

    it("should not fail when signature is invalid #2", async function () {
      this.blueprint.signature =
        "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      await expect(
        this.tractor.connect(publisher).destroyBlueprint(this.blueprint)
      ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
    });

    it("should not fail when signature is invalid #3", async function () {
      await signBlueprint(this.blueprint, user);
      await expect(
        this.tractor.connect(publisher).destroyBlueprint(this.blueprint)
      ).to.be.revertedWith("TractorFacet: invalid signature");
    });

    it("should destroy blueprint", async function () {
      await signBlueprint(this.blueprint, publisher);
      const tx = await this.tractor
        .connect(publisher)
        .destroyBlueprint(this.blueprint);

      const hash = getBlueprintHash(this.blueprint);
      await expect(tx).to.emit(this.tractor, "DestroyBlueprint").withArgs(hash);

      const nonce = await this.tractor.blueprintNonce(this.blueprint);
      expect(nonce).to.be.eq(ethers.constants.MaxUint256);
    });
  });

  describe("Tractor Operation", function () {
    it("when blueprint is not active #1", async function () {
      const blueprint = {
        ...this.blueprint,
        startTime: Math.floor(Date.now() / 1000) + 3600,
      };
      await signBlueprint(blueprint, publisher);

      await expect(
        this.tractor.connect(user).tractor(blueprint, "0x")
      ).to.be.revertedWith("TractorFacet: blueprint is not active");
    });

    it("when blueprint is not active #2", async function () {
      const blueprint = {
        ...this.blueprint,
        endTime: Math.floor(Date.now() / 1000) - 3600,
      };
      await signBlueprint(blueprint, publisher);

      await expect(
        this.tractor.connect(user).tractor(blueprint, "0x")
      ).to.be.revertedWith("TractorFacet: blueprint is not active");
    });

    it("when maxNonce is reached", async function () {
      const blueprint = {
        ...this.blueprint,
        maxNonce: 0,
      };
      await signBlueprint(blueprint, publisher);

      await expect(
        this.tractor.connect(user).tractor(blueprint, "0x")
      ).to.be.revertedWith("TractorFacet: maxNonce reached");
    });

    it("blueprint type - unknown", async function () {
      const blueprint = {
        ...this.blueprint,
        data: "0x0203040506070809",
      };
      await signBlueprint(blueprint, publisher);

      await expect(
        this.tractor.connect(user).tractor(blueprint, "0x")
      ).to.be.revertedWith("TractorFacet: unknown blueprint type");
    });

    it("blueprint type - normal", async function () {
      const data = getNormalBlueprintData([]);
      const blueprint = {
        ...this.blueprint,
        data,
      };

      await signBlueprint(blueprint, publisher);

      const tx = await this.tractor.connect(user).tractor(blueprint, "0x");

      const hash = getBlueprintHash(blueprint);
      await expect(tx)
        .to.emit(this.tractor, "Tractor")
        .withArgs(userAddress, hash);
    });

    it("blueprint type - advanced", async function () {
      const data = getAdvancedBlueprintData([]);
      const blueprint = {
        ...this.blueprint,
        data,
      };

      await signBlueprint(blueprint, publisher);

      const tx = await this.tractor.connect(user).tractor(blueprint, "0x");

      const hash = getBlueprintHash(blueprint);
      await expect(tx)
        .to.emit(this.tractor, "Tractor")
        .withArgs(userAddress, hash);
    });
  });

  it("Plant Tractor", async function () {
    const plant = await this.silo.interface.encodeFunctionData(
      "tractorPlant",
      []
    );
    const transferToken = await this.tokenFacet.interface.encodeFunctionData(
      "tractorTransferToken",
      [BEAN, ZERO_ADDRESS, to6("1"), 0, 0]
    );

    const blueprint = {
      publisher: userAddress,
      data: getNormalBlueprintData([plant, transferToken]),
      calldataCopyParams: generateCalldataCopyParams([
        [-1, 224 + 36 + 32, 0],
        [32, 224 + 132 + 32, 32],
      ]),
      maxNonce: 100,
      startTime: Math.floor(Date.now() / 1000) - 10 * 3600,
      endTime: Math.floor(Date.now() / 1000) + 10 * 3600,
    };
    const calldata = ethers.utils.hexZeroPad(
      ethers.BigNumber.from(1).toHexString(),
      32
    );

    await signBlueprint(blueprint, user);

    await this.season.siloSunrise(to6("100"));

    await this.tractor.connect(user3).tractor(blueprint, calldata);
  });
});
