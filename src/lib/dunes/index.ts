import { Psbt, payments, Transaction } from "bitcoinjs-lib";
import {
  DunestoneSchema,
  EtchingSchema,
  IDunestone,
  IEdict,
  IEtching,
  MintSchema,
} from "@/lib/dunes/dunestone";
import {
  getWitnessUtxo,
  toTaprootSigner,
  WalletSigner,
} from "@/lib/crypto/wallet";
import {
  BoxedSuccess,
  BoxedError,
  BoxedResponse,
  isBoxedError,
} from "@/lib/utils/boxed";
import { NETWORK } from "@/lib/consts";
import { esplora_getutxos, esplora_getfee } from "@/lib/apis/esplora";
import {
  dunesrpc_getDuneUtxoBalances,
  dunesrpc_getutxos,
} from "@/lib/apis/dunes";
import { EsploraUtxo } from "@/lib/apis/esplora/types";
import { getCurrentTaprootAddress } from "@/lib/crypto/wallet";
import { get } from "http";
import { DuneUtxoBalance, ParsedUtxoBalance } from "../apis/dunes/types";
import chalk from "chalk";

function isBTCTransfer(
  transfer: SingularTransfer
): transfer is SingularBTCTransfer {
  return transfer.asset === "btc";
}

type IFeeOpts = {
  vsize: number;
  input_length: number;
};

export class DunestoneTransaction {
  private initialized = false;

  private MINIMUM_FEE = 500;
  private MINIMUM_DUST = 546;

  //These are used to calculate the fee and outputs that will be used in the transaction. These are not in the final transaction
  private availableUtxos: EsploraUtxo[] = [];
  private availableDuneUtxoBalances: ParsedUtxoBalance[] = [];

  //These are the utxos that will be used in the transaction
  private utxos: EsploraUtxo[] = [];

  //Keep track of the current PSBT
  private psbt: Psbt;

  //On the second run, the fee will be calculated based on the vsize of the first transaction
  private fee: number = 0;

  private readonly network = NETWORK;
  private changeAddress: string;
  private cumulativeSpendRequirementBtc: number = 0;
  private cumulativeSpendRequirementDunes: Record<string, bigint> = {};

  private feeOpts: IFeeOpts | undefined;

  constructor(
    private readonly signer: WalletSigner,
    private readonly options: DunestoneTransactionOptions
  ) {
    this.psbt = new Psbt({ network: this.network });
    this.changeAddress = getCurrentTaprootAddress(this.signer);

    this.feeOpts = options.feeOpts;
  }

  private async fetchResources(): Promise<void> {
    const esploraUtxoResponse = await esplora_getutxos(this.changeAddress);
    if (isBoxedError(esploraUtxoResponse)) {
      throw new Error(
        `Failed to fetch BTC utxos: ${esploraUtxoResponse.message}`
      );
    }
    this.availableUtxos = esploraUtxoResponse.data;

    const duneUtxoResponse = await dunesrpc_getDuneUtxoBalances(
      this.changeAddress
    );
    if (isBoxedError(duneUtxoResponse)) {
      throw new Error(
        `Failed to fetch Dune utxos: ${duneUtxoResponse.message}`
      );
    }

    this.availableDuneUtxoBalances =
      duneUtxoResponse.data.map<ParsedUtxoBalance>((utxo_balance) => {
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
    const feeResp = await esplora_getfee();
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

    this.cumulativeSpendRequirementDunes = this.options.transfers.reduce(
      (acc, transfer) => {
        if (isBTCTransfer(transfer)) {
          this.cumulativeSpendRequirementBtc += transfer.amount;
          return acc;
        }

        const duneId = transfer.asset;
        acc[duneId] = (acc[duneId] || 0n) + transfer.amount;

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

  //This function gets the txids of all the utxos that are needed to meet the dune requirement
  private getDuneUtxosToMeetDuneRequirement(): Set<string> {
    const duneUtxos: Set<string> = new Set();

    for (const dune of Object.keys(this.cumulativeSpendRequirementDunes)) {
      /*
        First we sort the utxo balances by their "balance" in ascending order. The cli does
        automatic utxo management, so we use "dust" values first so that the address has as
        few UTXOs as possible, even if it means using more UTXOs to meet the requirement.
      */
      const duneUtxoBalances = this.availableDuneUtxoBalances
        .filter((utxo) => utxo.dune.dune_protocol_id === dune)
        .sort((a, b) => a.balance - b.balance);

      let accumulated = 0n;
      for (const utxo of duneUtxoBalances) {
        if (accumulated >= this.cumulativeSpendRequirementDunes[dune]) {
          break;
        }
        accumulated += utxo.balance;
        duneUtxos.add(utxo.utxo.id);
      }

      if (accumulated < this.cumulativeSpendRequirementDunes[dune]) {
        throw new Error(
          `Insufficient Dune UTXOs to meet the requirement for ${dune}.`
        );
      }
    }
    return duneUtxos;
  }

  private getEsploraUtxosToMeetAllRequirements(): EsploraUtxo[] {
    const utxosToMeetRequirements: EsploraUtxo[] = [];
    const duneUtxos = this.getDuneUtxosToMeetDuneRequirement();

    const esploraUtxoMap = new Map(
      this.availableUtxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo])
    );

    //Initialize accumulated with the value of the UTXOs we have to send anyway for the dunes
    let accumulated = Array.from(duneUtxos).reduce((acc, duneUtxo) => {
      const utxo = esploraUtxoMap.get(duneUtxo);
      if (utxo) {
        acc += utxo.value;
      } else {
        throw new Error(`UTXO ${duneUtxo} not found in esplora UTXOs.`);
      }
      return acc;
    }, 0);

    const sortedUtxos = [...this.availableUtxos].sort(
      (a, b) => b.value - a.value
    );
    for (const utxo of sortedUtxos) {
      if (accumulated >= this.cumulativeSpendRequirementBtc) {
        break;
      }
      if (duneUtxos.has(`${utxo.txid}:${utxo.vout}`)) {
        utxosToMeetRequirements.push(utxo);
        continue;
      }
      accumulated += utxo.value;
      utxosToMeetRequirements.push(utxo);
    }
    if (accumulated < this.cumulativeSpendRequirementBtc) {
      throw new Error(
        `Insufficient BTC UTXOs to meet the requirement for BTC.`
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

  private async initialize(): Promise<void> {
    await this.calculateFee();
    await this.fetchResources();
    this.fetchUtxos();
    this.initialized = true;
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

  private addOutputs(btcOutputs: Record<string, number>): void {
    let totalOutputValue = 0;
    let totalInputValue = this.utxos.reduce((acc, utxo) => acc + utxo.value, 0);
    for (const [address, amount] of Object.entries(btcOutputs)) {
      this.psbt.addOutput({
        address,
        value: amount,
      });

      totalOutputValue += amount;
    }
    const changeValue = totalInputValue - totalOutputValue - this.fee;
    if (changeValue >= this.MINIMUM_DUST) {
      this.psbt.addOutput({
        address: this.changeAddress,
        value: changeValue,
      });
    }
  }

  private addInputs(): void {
    for (const utxo of this.utxos) {
      const witnessUtxo = getWitnessUtxo(utxo, this.signer);
      this.psbt.addInput(witnessUtxo);
    }
  }

  private createEdicts(btcOutputs: Record<string, number>): IEdict[] {
    //Mapped by address, and then duneID. Everything is flattened in the end
    const duneEdicts: Record<string, Record<string, IEdict>> = {};
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
      const duneId = transfer.asset;
      const address = transfer.address;

      const duneEdict = {
        id: duneId,
        amount: transfer.amount.toString(),
        output: outputIds[address],
      };
      if (!duneEdicts[address]) {
        duneEdicts[address] = {};
      }

      if (!duneEdicts[address][duneId]) {
        duneEdicts[address][duneId] = duneEdict;
      } else {
        duneEdicts[address][duneId].amount = (
          BigInt(duneEdicts[address][duneId].amount) + BigInt(duneEdict.amount)
        ).toString();
      }
    }

    let transactionEdicts = Object.values(duneEdicts)
      .map((addressEdicts) => Object.values(addressEdicts))
      .flat(2);

    return transactionEdicts;
  }

  private addDunestoneData(edicts?: IEdict[]): boolean {
    let dunestone: IDunestone = { p: "https://dunes.sh" };

    if (this.options.partialDunestone?.etching) {
      dunestone.etching = this.options.partialDunestone.etching;
    }
    if (this.options.partialDunestone?.mint) {
      dunestone.mint = this.options.partialDunestone.mint;
    }
    if (edicts && edicts.length > 0) {
      dunestone.edicts = edicts;
    }

    const parsed = DunestoneSchema.safeParse(dunestone);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid Dunestone";
      throw new Error(issue);
    }
    const dunestoneData = parsed.data;
    if (Object.keys(dunestoneData).length === 1) return false;

    const json = JSON.stringify(dunestoneData);

    const data = Buffer.from(json, "utf8");

    if (data.length > 80 && this.feeOpts) {
      console.log(
        chalk.yellow(
          `\nWARNING: Dunestone exceeds 80 bytes, currently only MARA pool supports OP_RETURNS > 80 bytes. This transaction may take a day to be confirmed. There are talks of increasing the BTC OP_RETURN limit currently, show your support here: https://github.com/bitcoin/bitcoin/pull/32359`
        )
      );
    }

    const embed = payments.embed({ data: [data] });
    this.psbt.addOutput({
      script: embed.output!,
      value: 0,
    });
    return true;
  }

  public async build(): Promise<number> {
    await this.initialize();
    this.addInputs();
    const btcOutputs = this.getBtcOutputs();
    this.addOutputs(btcOutputs);

    const edicts = this.createEdicts(btcOutputs);
    let hasDunestone = this.addDunestoneData(edicts);

    //If we have a dunestone, we need to add a second output for the opreturn. Otherwise just one for the change
    return this.utxos.length + (hasDunestone ? 2 : 1);
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

type SingularBTCTransfer = {
  asset: "btc";
  amount: number;
  address: string;
};

type SingularDuneTransfer = {
  asset: string;
  amount: bigint;
  address: string;
};

type SingularTransfer = SingularBTCTransfer | SingularDuneTransfer;

type DunestoneTransactionOptions = {
  //If etching or mint are included, a new output will be created to collect the dunes
  partialDunestone?: PartialDunestone;
  transfers: SingularTransfer[];
  feeOpts?: IFeeOpts;
};

type PartialDunestone = {
  etching?: IEtching;
  mint?: string;
};

export async function getDunestoneTransaction(
  signer: WalletSigner,
  options: DunestoneTransactionOptions
): Promise<BoxedResponse<Transaction, string>> {
  let partialDunestone = {} as PartialDunestone;

  if (options.partialDunestone?.etching) {
    const parsed = EtchingSchema.safeParse(options.partialDunestone?.etching);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid Dunestone";
      return new BoxedError("ValidationError", issue);
    }
    partialDunestone["etching"] = parsed.data;
  }

  if (options.partialDunestone?.mint) {
    const parsed = MintSchema.safeParse(options.partialDunestone?.mint);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid Dunestone";
      return new BoxedError("ValidationError", issue);
    }
    partialDunestone["mint"] = parsed.data;
  }

  const dummyDunesTx = new DunestoneTransaction(signer, {
    ...options,
    partialDunestone,
  });
  const dummyInputLength = await dummyDunesTx.build();
  let dummyTx = dummyDunesTx.finalize();

  const dunestoneTx = new DunestoneTransaction(signer, {
    ...options,
    partialDunestone,
    feeOpts: {
      vsize: dummyTx.virtualSize(),
      input_length: dummyInputLength,
    },
  });
  await dunestoneTx.build();
  const tx = dunestoneTx.finalize();

  return new BoxedSuccess(tx);
}
