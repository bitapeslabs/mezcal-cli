import { Psbt, payments, Transaction, script } from "bitcoinjs-lib";
import {
  MezcalstoneSchema,
  EtchingSchema,
  IMezcalstoneInput,
  IEdict,
  IEtching,
  MintSchema,
  IEdictInput,
} from "./mezcalstone";
import {
  getWitnessUtxo,
  toTaprootSigner,
  WalletSigner,
  getTapInternalKey,
  getPubKey,
} from "@/lib/crypto/wallet";
import {
  BoxedSuccess,
  BoxedError,
  BoxedResponse,
  isBoxedError,
} from "@/lib/utils/boxed";
import { CURRENT_BTC_TICKER, NETWORK } from "@/lib/consts";
import {
  esplora_getutxos,
  esplora_getfee,
  esplora_getspendableinputs,
} from "@/lib/apis/esplora";
import { IEsploraSpendableUtxo } from "@/lib/apis/esplora/types";
import {
  mezcalrpc_getMezcalUtxoBalances,
  mezcalrpc_getutxos,
} from "@/lib/apis/mezcal";
import { EsploraUtxo } from "@/lib/apis/esplora/types";
import { getCurrentTaprootAddress } from "@/lib/crypto/wallet";
import { get } from "http";
import { MezcalUtxoBalance, ParsedUtxoBalance } from "../apis/mezcal/types";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
/*
export function getWitnessUtxoFromAddress(
  utxo: { txid: string; vout: number; value: number },
  addressProvided: string
) {
  const output = address.toOutputScript(addressProvided, NETWORK);

  return {
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: output,
      value: utxo.value,
    },
  };
}
*/
function isBTCTransfer(
  transfer: SingularTransfer
): transfer is SingularBTCTransfer {
  return transfer.asset === "btc";
}

type IFeeOpts = {
  vsize: number;
  input_length: number;
};

function scriptTypeFromOutput(script: Buffer): string {
  const len = script.length;

  // quick pattern for Taproot: OP_PUSHNUM_1 (0x51) + 0x20 + 32-byte key
  if (len === 34 && script[0] === 0x51 && script[1] === 0x20)
    return "witness_v1_taproot";

  // quick pattern for v0 P2WPKH: 0x00 0x14 + 20-byte hash
  if (len === 22 && script[0] === 0x00 && script[1] === 0x14)
    return "witnesspubkeyhash";

  // 0xa9 … 0x87 -> P2SH
  if (len === 23 && script[0] === 0xa9 && script[len - 1] === 0x87)
    return "scripthash";

  // 25-byte legacy P2PKH: DUP HASH160 … EQUALVERIFY CHECKSIG
  if (len === 25 && script[0] === 0x76 && script[1] === 0xa9)
    return "pubkeyhash";

  // fallback – try payment helpers but swallow errors
  const safe = <T>(fn: () => T | undefined) => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  if (safe(() => payments.p2wpkh({ output: script })))
    return "witnesspubkeyhash";
  if (safe(() => payments.p2pkh({ output: script }))) return "pubkeyhash";
  if (safe(() => payments.p2sh({ output: script }))) return "scripthash";

  return "unknown";
}

export function addInputDynamic(psbt: Psbt, utxo: IEsploraSpendableUtxo) {
  const prevTx = utxo.prevTx;
  const prevOut = prevTx.vout[utxo.vout];
  const scriptBuf = Buffer.from(prevOut.scriptpubkey, "hex");
  const scriptType = prevOut.scriptpubkey_type; // prefer Esplora tag
  const classifyType = scriptTypeFromOutput(scriptBuf);
  const type = scriptType ?? classifyType; // fallback if absent

  switch (type) {
    // ---------------- P2WPKH ----------------
    case "v0_p2wpkh":
    case "witnesspubkeyhash": {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: scriptBuf,
          value: prevOut.value,
        },
      });
      break;
    }

    case "p2pkh":
    case "pubkeyhash": {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(prevTx.hex, "hex"),
      });
      break;
    }

    case "p2sh":
    case "scripthash": {
      const redeem = payments.p2sh({ output: scriptBuf, network: NETWORK });
      if (
        redeem.redeem &&
        scriptTypeFromOutput(redeem.redeem.output!) === "witnesspubkeyhash"
      ) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: redeem.output!,
            value: prevOut.value,
          },
          redeemScript: redeem.redeem.output!,
        });
      } else {
        throw new Error("Unsupported P2SH script (not a P2WPKH nested)");
      }
      break;
    }

    case "v1_p2tr":
    case "witness_v1_taproot": {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: scriptBuf,
          value: prevOut.value,
        },
        tapInternalKey: scriptBuf.subarray(2, 34),
      });
      break;
    }

    default:
      throw new Error(`Unsupported script type: ${type}`);
  }
}

export class MezcalstoneTransaction {
  private MINIMUM_FEE = 500;
  private MINIMUM_DUST = 546;

  //These are used to calculate the fee and outputs that will be used in the transaction. These are not in the final transaction
  private availableUtxos: EsploraUtxo[] = [];
  private availableSpendableUtxos: IEsploraSpendableUtxo[] = [];
  private availableMezcalUtxoBalances: ParsedUtxoBalance[] = [];

  //These are the utxos that will be used in the transaction
  private utxos: EsploraUtxo[] = [];

  //Keep track of the current PSBT
  private psbt: Psbt;

  //On the second run, the fee will be calculated based on the vsize of the first transaction
  private fee: number = 0;

  private readonly network = NETWORK;
  private changeAddress: string;
  private cumulativeSpendRequirementBtc: number = 0;
  private cumulativeSpendRequirementMezcals: Record<string, bigint> = {};

  private feeOpts: IFeeOpts | undefined;

  constructor(
    private readonly signer: WalletSigner,
    private readonly options: MezcalstoneTransactionOptions
  ) {
    this.psbt = new Psbt({ network: this.network });
    this.changeAddress = getCurrentTaprootAddress(this.signer);

    this.feeOpts = options.feeOpts;
  }

  private async fetchResources(): Promise<void> {
    const esploraUtxoResponse = await esplora_getutxos(this.changeAddress);
    if (isBoxedError(esploraUtxoResponse)) {
      throw new Error(
        `Failed to fetch ${CURRENT_BTC_TICKER} utxos: ${esploraUtxoResponse.message}`
      );
    }
    this.availableUtxos = esploraUtxoResponse.data.filter(
      (utxo) => utxo.status.confirmed
    );

    const mezcalUtxoResponse = await mezcalrpc_getMezcalUtxoBalances(
      this.changeAddress
    );
    if (isBoxedError(mezcalUtxoResponse)) {
      throw new Error(
        `Failed to fetch Mezcal utxos: ${mezcalUtxoResponse.message}`
      );
    }

    this.availableMezcalUtxoBalances =
      mezcalUtxoResponse.data.map<ParsedUtxoBalance>((utxo_balance) => {
        return {
          ...utxo_balance,
          balance: BigInt(utxo_balance.balance),
        } as ParsedUtxoBalance;
      });

    /*
      On the first "dry" run, there will be no vsize, so the fee will be 500 * minimumRate - which is the minimum for the network
    */
    await this.calculateFee();

    return;
  }

  private async calculateFee(): Promise<void> {
    //avoid round trip to esplora if we are just creating the dummy tx
    const feeResp = this.feeOpts ? await esplora_getfee() : new BoxedSuccess(1);
    const feeRate = isBoxedError(feeResp) ? 1 : feeResp.data;
    //Seee suggestion @ https://github.com/bitcoinjs/bitcoinjs-lib/issues/1566
    let baseFee =
      Math.ceil(
        (this.feeOpts?.vsize ?? 0) + (this.feeOpts?.input_length ?? 0) * 2
      ) * feeRate;

    this.fee = Math.max(baseFee, this.MINIMUM_FEE);
  }

  private calcCumulativeSpendRequirements() {
    //Reinitialize the cumulative spend requirements incase of multiple calls
    this.cumulativeSpendRequirementBtc = 0;

    this.cumulativeSpendRequirementMezcals = this.options.transfers.reduce(
      (acc, transfer) => {
        if (isBTCTransfer(transfer)) {
          this.cumulativeSpendRequirementBtc += transfer.amount;
          return acc;
        }

        const mezcalId = transfer.asset;
        acc[mezcalId] = (acc[mezcalId] || 0n) + transfer.amount;

        return acc;
      },
      {} as Record<string, bigint>
    );

    if (this.cumulativeSpendRequirementBtc < this.fee + this.MINIMUM_DUST) {
      //Ensures we fetch atleast one UTXO to cover the fee and dust
      this.cumulativeSpendRequirementBtc = this.fee + this.MINIMUM_DUST;
    }

    return;
  }

  //This function gets the txids of all the utxos that are needed to meet the mezcal requirement
  private getMezcalUtxosToMeetMezcalRequirement(): Set<string> {
    const mezcalUtxos: Set<string> = new Set();

    for (const mezcal of Object.keys(this.cumulativeSpendRequirementMezcals)) {
      /*
        First we sort the utxo balances by their "balance" in ascending order. The cli does
        automatic utxo management, so we use "dust" values first so that the address has as
        few UTXOs as possible, even if it means using more UTXOs to meet the requirement.
      */
      const mezcalUtxoBalances = this.availableMezcalUtxoBalances
        .filter((utxo) => utxo.mezcal.mezcal_protocol_id === mezcal)
        .sort((a, b) =>
          a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0
        );

      let accumulated = 0n;
      for (const utxo of mezcalUtxoBalances) {
        if (accumulated >= this.cumulativeSpendRequirementMezcals[mezcal]) {
          break;
        }

        accumulated += utxo.balance;
        mezcalUtxos.add(`${utxo.utxo.transaction}:${utxo.utxo.vout_index}`);
      }

      if (accumulated < this.cumulativeSpendRequirementMezcals[mezcal]) {
        throw new Error(
          `Insufficient Mezcal UTXOs to meet the requirement for ${mezcal}.`
        );
      }
    }
    return mezcalUtxos;
  }

  private getEsploraUtxosToMeetAllRequirements(): EsploraUtxo[] {
    const utxosToMeetRequirements: EsploraUtxo[] = [];
    const mezcalUtxos = this.getMezcalUtxosToMeetMezcalRequirement();

    const esploraUtxoMap = new Map(
      this.availableUtxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo])
    );

    const sortedUtxos = [...this.availableUtxos].sort(
      (a, b) => b.value - a.value
    );

    //Add all mezcal utxos to the utxosToMeetRequirements
    let accumulated = 0;
    for (const mezcalUtxo of mezcalUtxos) {
      const utxo = esploraUtxoMap.get(mezcalUtxo);
      if (utxo) {
        accumulated += utxo.value;
        utxosToMeetRequirements.push(utxo);
      } else {
        throw new Error(`UTXO ${mezcalUtxo} not found in esplora UTXOs.`);
      }
    }

    for (const utxo of sortedUtxos) {
      if (accumulated >= this.cumulativeSpendRequirementBtc) {
        break;
      }
      if (mezcalUtxos.has(`${utxo.txid}:${utxo.vout}`)) {
        continue;
      }
      accumulated += utxo.value;
      utxosToMeetRequirements.push(utxo);
    }
    if (accumulated < this.cumulativeSpendRequirementBtc) {
      throw new Error(
        `Insufficient ${CURRENT_BTC_TICKER} UTXOs to meet the requirement for ${CURRENT_BTC_TICKER}.`
      );
    }
    return utxosToMeetRequirements;
  }

  private fetchUtxos(): void {
    if (!this.availableUtxos) {
      throw new Error("Must call fetchResources before fetchUtxos");
    }
    this.calcCumulativeSpendRequirements();
    this.utxos = this.getEsploraUtxosToMeetAllRequirements();
  }

  private async fetchSpendableInputs(): Promise<void> {
    const spendableInputs = await esplora_getspendableinputs(this.utxos);
    if (isBoxedError(spendableInputs)) {
      throw new Error(
        `Failed to fetch spendable inputs: ${spendableInputs.message}`
      );
    }

    this.availableSpendableUtxos = spendableInputs.data;
  }

  private async initialize(): Promise<void> {
    await this.calculateFee();
    await this.fetchResources();
    this.fetchUtxos();
    await this.fetchSpendableInputs();
  }

  private getBtcOutputs(): Record<string, number> {
    const cumulativeBtcRequirementsPerAddress: Record<string, number> = {};

    for (const transfer of this.options.transfers) {
      const current =
        cumulativeBtcRequirementsPerAddress[transfer.address] || 0;

      if (isBTCTransfer(transfer)) {
        cumulativeBtcRequirementsPerAddress[transfer.address] =
          current + transfer.amount;
      } else {
        // Ensure we don't lower an existing value below dust
        cumulativeBtcRequirementsPerAddress[transfer.address] = current;
      }
    }

    for (const address in cumulativeBtcRequirementsPerAddress) {
      const amount = cumulativeBtcRequirementsPerAddress[address];
      cumulativeBtcRequirementsPerAddress[address] = Math.max(
        amount,
        this.MINIMUM_DUST
      );
    }

    return cumulativeBtcRequirementsPerAddress;
  }

  private addOutputs(btcOutputs: Record<string, number>): boolean {
    let hasChange = false;

    let totalOutputValue = Object.values(btcOutputs).reduce(
      (acc, amount) => acc + amount,
      0
    );

    let totalInputValue = this.utxos.reduce((acc, utxo) => acc + utxo.value, 0);

    const changeValue = Math.round(
      totalInputValue - totalOutputValue - this.fee
    );

    //Change goes first, so it receives the mezcals not in the edicts
    if (changeValue >= this.MINIMUM_DUST) {
      hasChange = true;
      this.psbt.addOutput({
        address: this.changeAddress,
        value: changeValue,
      });
    }

    for (const [address, amount] of Object.entries(btcOutputs)) {
      this.psbt.addOutput({
        address,
        value: amount,
      });
    }
    return hasChange;
  }

  private addInputs(): void {
    for (const utxo of this.availableSpendableUtxos) {
      addInputDynamic(this.psbt, utxo);
    }
  }

  private createEdicts(
    btcOutputs: Record<string, number>,
    hasChange: boolean
  ): IEdictInput[] {
    //Mapped by address, and then mezcalID. Everything is flattened in the end
    const mezcalEdicts: Record<string, Record<string, IEdict>> = {};
    const outputIds: Record<string, number> = {};

    let outputIndex = 0;
    for (const [address, amount] of Object.entries(btcOutputs)) {
      outputIds[address] = outputIndex;
      outputIndex++;
    }

    for (const transfer of this.options.transfers) {
      if (transfer.asset === "btc") {
        continue;
      }
      const mezcalId = transfer.asset;
      const address = transfer.address;

      const mezcalEdict = {
        id: mezcalId,
        amount: transfer.amount.toString(),
        output: outputIds[address] + (hasChange ? 1 : 0),
      };
      if (!mezcalEdicts[address]) {
        mezcalEdicts[address] = {};
      }

      if (!mezcalEdicts[address][mezcalId]) {
        mezcalEdicts[address][mezcalId] = mezcalEdict;
      } else {
        mezcalEdicts[address][mezcalId].amount = (
          BigInt(mezcalEdicts[address][mezcalId].amount) +
          BigInt(mezcalEdict.amount)
        ).toString();
      }
    }

    let transactionEdicts = Object.values(mezcalEdicts)
      .map((addressEdicts) =>
        Object.values(addressEdicts).map((edict) => [
          edict.id,
          edict.amount,
          edict.output,
        ])
      )
      .flat(1) as IEdictInput[];

    return transactionEdicts;
  }

  private addMezcalstoneData(
    edicts?: IEdictInput[]
  ): IMezcalstoneInput | undefined {
    let mezcalstone: IMezcalstoneInput = { p: "https://mezcal.sh" };

    if (this.options.partialMezcalstone?.etching) {
      mezcalstone.etching = this.options.partialMezcalstone.etching;
    }
    if (this.options.partialMezcalstone?.mint) {
      mezcalstone.mint = this.options.partialMezcalstone.mint;
    }
    if (edicts && edicts.length > 0) {
      mezcalstone.edicts = edicts;
    }

    const parsed = MezcalstoneSchema.safeParse(mezcalstone);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid Mezcalstone";
      throw new Error(issue);
    }
    const mezcalstoneData = parsed.data;
    if (Object.keys(mezcalstoneData).length === 1) return undefined;

    const json = JSON.stringify(mezcalstone);

    console.log(json);

    const data = Buffer.from(json, "utf8");

    const embed = payments.embed({ data: [data] });
    this.psbt.addOutput({
      script: embed.output!,
      value: 0,
    });
    return mezcalstone;
  }

  public async build(): Promise<[number, IMezcalstoneInput | undefined]> {
    await this.initialize();

    this.addInputs();
    const btcOutputs = this.getBtcOutputs();
    let hasChange = this.addOutputs(btcOutputs);

    const edicts = this.createEdicts(btcOutputs, hasChange);
    let mezcalstone = this.addMezcalstoneData(edicts);

    //If we have a mezcalstone, we need to add a second output for the opreturn. Otherwise just one for the change
    return [this.utxos.length + (mezcalstone ? 2 : 1), mezcalstone];
  }

  public finalize(): Transaction {
    const signer = toTaprootSigner(this.signer);
    this.psbt.signAllInputs(signer);
    this.psbt.finalizeAllInputs();
    return this.psbt.extractTransaction();
  }

  public getPsbt(): Psbt {
    return this.psbt;
  }
}

export type SingularBTCTransfer = {
  asset: "btc";
  amount: number;
  address: string;
};

export type SingularMezcalTransfer = {
  asset: string;
  amount: bigint;
  address: string;
};

export type SingularTransfer = SingularBTCTransfer | SingularMezcalTransfer;

type MezcalstoneTransactionOptions = {
  //If etching or mint are included, a new output will be created to collect the mezcals
  partialMezcalstone?: PartialMezcalstone;
  transfers: SingularTransfer[];
  feeOpts?: IFeeOpts;
};

type PartialMezcalstone = {
  etching?: IEtching;
  mint?: string;
};

export async function getMezcalstoneTransaction(
  signer: WalletSigner,
  options: MezcalstoneTransactionOptions
): Promise<BoxedResponse<Transaction, string>> {
  const buildSpin = ora("Creating transaction…").start();

  let partialMezcalstone = {} as PartialMezcalstone;

  if (options.partialMezcalstone?.etching) {
    const parsed = EtchingSchema.safeParse(options.partialMezcalstone?.etching);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid Mezcalstone";
      buildSpin.stop();
      return new BoxedError("ValidationError", issue);
    }
    partialMezcalstone["etching"] = parsed.data;
  }

  if (options.partialMezcalstone?.mint) {
    const parsed = MintSchema.safeParse(options.partialMezcalstone?.mint);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid Mezcalstone";
      buildSpin.stop();

      return new BoxedError("ValidationError", issue);
    }
    partialMezcalstone["mint"] = parsed.data;
  }

  const dummyMezcalsTx = new MezcalstoneTransaction(signer, {
    ...options,
    partialMezcalstone,
  });
  const [dummyInputLength, dummyMezcalstone] = await dummyMezcalsTx.build();
  buildSpin.stop();

  if (dummyMezcalstone) {
    const mezcalstoneBuffer = Buffer.from(
      JSON.stringify(dummyMezcalstone),
      "utf8"
    );

    if (mezcalstoneBuffer.length > 80) {
      const warning = chalk.yellow(
        `\nWARNING: Mezcalstone exceeds 80 bytes.\n` +
          `Only MARA pool currently supports OP_RETURNs over 80 bytes.\n` +
          `This transaction may take hours or even a day to confirm.\n` +
          `Proposal to increase the limit: https://github.com/bitcoin/bitcoin/pull/32359\n`
      );
      console.log(warning);

      const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
        {
          type: "confirm",
          name: "proceed",
          message: "Continue anyway?",
          default: false,
        },
      ]);

      if (!proceed) {
        throw new Error("Transaction cancelled by user.");
      }
    }
  }
  let dummyTx = dummyMezcalsTx.finalize();

  let feeOpts = {
    vsize: dummyTx.virtualSize(),
  };

  console.log(
    chalk.green(`\n\nCreating transaction with size -> ${feeOpts.vsize} bytes`)
  );

  const finalizeSpin = ora("Finalizing transaction…").start();

  const mezcalstoneTx = new MezcalstoneTransaction(signer, {
    ...options,
    partialMezcalstone,
    feeOpts: {
      vsize: dummyTx.virtualSize(),
      input_length: dummyInputLength,
    },
  });
  await mezcalstoneTx.build();
  const tx = mezcalstoneTx.finalize();
  finalizeSpin.succeed("Transaction finalized.");
  console.log(tx.toHex());
  return new BoxedSuccess(tx);
}
