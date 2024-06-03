import React, { createContext, useCallback, useMemo, useState } from "react";
import { ERC20Token, TokenValue } from "@beanstalk/sdk-core";
import { DeepRequired } from "react-hook-form";
import useSdk from "src/utils/sdk/useSdk";
import useAquifer from "src/utils/sdk/useAquifer";
import { TransactionToast } from "../TxnToast/TransactionToast";
import { Log } from "src/utils/logger";
import { Pump, Well, WellFunction } from "@beanstalk/sdk-wells";

type GoNextParams = {
  goNext?: boolean;
};

type WellTokensParams = {
  token1: ERC20Token;
  token2: ERC20Token;
};

type LiquidityAmounts = {
  token1Amount: string;
  token2Amount: string;
};

type WellDetails = {
  name: string;
  symbol: string;
};

export type CreateWellContext = {
  step: number;
  wellImplementation: string | undefined;
  wellFunction: string | undefined;
  wellFunctionData: string | undefined;
  pump: string | undefined;
  pumpData: string | undefined;
  wellDetails: Partial<WellDetails>;
  wellTokens: Partial<WellTokensParams>;
  liquidity: Partial<LiquidityAmounts>;
  salt: number | undefined;
  loading: boolean;
  goBack: () => void;
  goNext: () => void;
  setStep1: (params: Partial<{ wellImplementation: string } & GoNextParams>) => void;
  setStep2: (
    params: Partial<
      {
        wellFunction: string;
        wellFunctionData: string;
        token1: ERC20Token;
        token2: ERC20Token;
        pump: string;
        pumpData: string;
      } & GoNextParams
    >
  ) => void;
  setStep3: (params: Partial<WellDetails & GoNextParams>) => void;
  setStep4: (params: Partial<LiquidityAmounts & { salt?: number }>) => void;
  deployWell: (
    _salt?: number,
    _token1Amount?: TokenValue,
    _token2Amount?: TokenValue
  ) => Promise<any>;
};

export type CreateWellStepProps = DeepRequired<{
  step1: {
    wellImplementation: CreateWellContext["wellImplementation"];
  };
  step2: {
    wellFunction: CreateWellContext["wellFunction"];
    wellFunctionData: CreateWellContext["wellFunctionData"];
    pump: CreateWellContext["pump"];
    pumpData: CreateWellContext["pumpData"];
    wellTokens: CreateWellContext["wellTokens"];
  };
  step3: CreateWellContext["wellDetails"];
  step4: CreateWellContext["liquidity"] & {
    salt: CreateWellContext["salt"];
  };
}>;

const Context = createContext<CreateWellContext | null>(null);

export const CreateWellProvider = ({ children }: { children: React.ReactNode }) => {
  const aquifer = useAquifer();
  const sdk = useSdk();

  const [deploying, setDeploying] = useState(false);

  const [step, setStep] = useState<number>(0);

  // step 1
  const [wellImplementation, setWellImplementation] = useState<string | undefined>();

  // step 2
  const [pump, setPump] = useState<string | undefined>();
  const [pumpData, setPumpData] = useState<string | undefined>();
  const [wellFunction, setWellFunction] = useState<string | undefined>();
  const [wellFunctionData, setWellFunctionData] = useState<string | undefined>();
  const [wellTokens, setWellTokens] = useState<Partial<WellTokensParams>>({});

  // step 3
  const [wellDetails, setWellDetails] = useState<Partial<WellDetails>>({});

  // step 4
  const [liquidity, setLiquidity] = useState<Partial<LiquidityAmounts>>({});
  const [salt, setDeploySalt] = useState<number | undefined>();

  const methods = useMemo(() => {
    const handleSetLiquidity = (params: LiquidityAmounts) => setLiquidity(params);
    const handleSetSalt = (_salt: number) => setDeploySalt(_salt);
    const handleGoNext = () => {
      setStep((_step) => Math.min(_step + 1, 3));
    };
    const handleGoBack = () => {
      setStep((_step) => Math.max(_step - 1, 0));
    };
    const handleSetPump = (pump: string) => setPump(pump);
    const handleSetWellFunction = (wellFunction: string) => setWellFunction(wellFunction);
    const handleSetWellDetails = (details: WellDetails) => setWellDetails(details);

    return {
      setLiquidity: handleSetLiquidity,
      setSalt: handleSetSalt,
      goNext: handleGoNext,
      goBack: handleGoBack,
      setPump: handleSetPump,
      setWellFunction: handleSetWellFunction,
      setWellDetails: handleSetWellDetails
    };
  }, []);

  const setStep1: CreateWellContext["setStep1"] = useCallback(
    (params) => {
      setWellImplementation(params.wellImplementation);
      params.goNext && methods.goNext();
    },
    [methods]
  );

  const setStep2: CreateWellContext["setStep2"] = useCallback(
    (params) => {
      setPump(params.pump);
      setWellFunction(params.wellFunction);
      setWellTokens({
        token1: params.token1,
        token2: params.token2
      });
      setWellFunctionData(params.wellFunctionData);
      setPumpData(params.pumpData);
      params.goNext && methods.goNext();
    },
    [methods]
  );

  const setStep3: CreateWellContext["setStep3"] = useCallback(
    ({ goNext, ...params }) => {
      setWellDetails(params);
      goNext && methods.goNext();
    },
    [methods]
  );

  const setStep4: CreateWellContext["setStep4"] = useCallback((params) => {
    setDeploySalt(params.salt);
    setLiquidity({
      token1Amount: params.token1Amount,
      token2Amount: params.token2Amount
    });
  }, []);

  const wellFunctionObject = useMemo(() => {
    if (!wellFunction) return undefined;
    return new WellFunction(sdk.wells, wellFunction, wellFunctionData || "0x");
  }, [sdk.wells, wellFunction, wellFunctionData]);

  const pumpObject = useMemo(() => {
    if (!pump) return undefined;
    return new Pump(sdk.wells, pump, pumpData || "0x");
  }, [sdk.wells, pump, pumpData]);

  const deployWell = useCallback(
    async (_salt?: number, _token1Amount?: TokenValue, _token2Amount?: TokenValue) => {
      const toast = new TransactionToast({
        loading: "Deploying Well...",
        error: "Failed to deploy Well",
        success: "Well deployed successfully"
      });
      setDeploying(true);
      Log.module("wellDeployer").debug("Deploying Well...");

      try {
        if (!wellImplementation) throw new Error("well implementation not set");
        if (!wellFunctionObject) throw new Error("well function not set");
        if (!pumpObject) throw new Error("pump not set");
        if (!wellTokens.token1) throw new Error("token 1 not set");
        if (!wellTokens.token2) throw new Error("token 2 not set");
        if (!wellDetails.name) throw new Error("well name not set");
        if (!wellDetails.symbol) throw new Error("well symbol not set");

        const deployedWell = await aquifer.boreWellWithOptions({
          implementationAddress: wellImplementation,
          tokens: [wellTokens.token1, wellTokens.token2],
          wellFunction: wellFunctionObject,
          pumps: [pumpObject],
          name: wellDetails.name,
          symbol: wellDetails.symbol,
          salt: _salt || salt
        });

        toast.confirming(deployedWell);

        const txn = await deployedWell.wait();

        if (!txn.events?.length) {
          throw new Error("No events found");
        }

        const boredWellAddress = txn.events[0].address;
        const well = new Well(sdk.wells, boredWellAddress);
        await well.loadWell();
        toast.success();

        return;
      } catch (e) {
        toast.error(e);
        return e;
      } finally {
        setDeploying(false);
      }
    },
    [
      wellImplementation,
      wellFunctionObject,
      pumpObject,
      wellTokens,
      wellDetails,
      aquifer,
      salt,
      sdk.wells
    ]
  );

  return (
    <Context.Provider
      value={{
        step,
        wellImplementation,
        wellFunction,
        wellFunctionData,
        pump,
        pumpData,
        wellDetails,
        wellTokens,
        liquidity,
        salt,
        loading: deploying,
        setStep1,
        setStep2,
        setStep3,
        setStep4,
        deployWell,
        ...methods
      }}
    >
      {children}
    </Context.Provider>
  );
};

export const useCreateWell = () => {
  const context = React.useContext(Context);

  if (!context) {
    throw new Error("useCreateWell must be used within a CreateWellProvider");
  }

  return context;
};
