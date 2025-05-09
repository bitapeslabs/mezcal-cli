import { Psbt, payments, Transaction } from "bitcoinjs-lib";
import { DunestoneSchema } from "@/lib/dunes/dunestone";
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
import { dunesrpc_getutxos } from "@/lib/apis/dunes";
import { EsploraUtxo } from "@/lib/apis/esplora/types";

interface DunestoneTransactionOptions {
  address: string;
  walletSigner: WalletSigner;
  sendDunes?: boolean;
}

export class DunestoneTransaction {
  private psbt: Psbt;
  private fee: number = 0;
  private readonly network = NETWORK;
  private utxos: EsploraUtxo[] = [];
  private changeAddress: string;
  private sendDunes: boolean;
  private selectedUtxos: EsploraUtxo[] = [];

  constructor(
    private readonly dunestone: unknown,
    private readonly options: DunestoneTransactionOptions
  ) {
    this.psbt = new Psbt({ network: this.network });
    this.changeAddress = options.address;
    this.sendDunes = options.sendDunes ?? false;
  }

  private async fetchUtxos(): Promise<void> {
    const esploraUtxosResp = await esplora_getutxos(this.changeAddress);
    if (isBoxedError(esploraUtxosResp)) {
      throw new Error(`Failed to fetch UTXOs: ${esploraUtxosResp.message}`);
    }
    this.utxos = esploraUtxosResp.data;

    if (!this.sendDunes) {
      const duneBalancesResp = await dunesrpc_getutxos(this.changeAddress);
      if (isBoxedError(duneBalancesResp)) {
        throw new Error(
          `Failed to fetch Dune balances: ${duneBalancesResp.message}`
        );
      }
      const duneUtxoSet = new Set(
        duneBalancesResp.data.map(
          (utxo) => `${utxo.transaction}:${utxo.vout_index}`
        )
      );
      this.utxos = this.utxos.filter(
        (utxo) => !duneUtxoSet.has(`${utxo.txid}:${utxo.vout}`)
      );
    }
  }

  private async calculateFee(): Promise<void> {
    const feeResp = await esplora_getfee();
    const feeRate = isBoxedError(feeResp) ? 1 : feeResp.data;
    this.fee = Math.ceil(500 * feeRate);
  }

  private selectInputs(): void {
    let accumulated = 0;
    for (const utxo of this.utxos) {
      let witnessUtxo = getWitnessUtxo(utxo, this.options.walletSigner);
      this.psbt.addInput(witnessUtxo);
      this.selectedUtxos.push(utxo);
      accumulated += utxo.value;
      if (accumulated >= this.fee) break;
    }
    if (accumulated < this.fee) {
      throw new Error("Insufficient funds to cover the fee.");
    }
  }

  private addOutputs(): void {
    const changeValue =
      this.selectedUtxos.reduce((sum, u) => sum + u.value, 0) - this.fee;

    if (this.sendDunes) {
      // Create a separate UTXO for Dunes
      this.psbt.addOutput({
        address: this.changeAddress,
        value: 546, // dust threshold
      });
      // Remaining change
      this.psbt.addOutput({
        address: this.changeAddress,
        value: changeValue - 546,
      });
    } else {
      this.psbt.addOutput({
        address: this.changeAddress,
        value: changeValue,
      });
    }
  }

  private addDunestoneData(): void {
    const json = JSON.stringify(this.dunestone);
    const data = Buffer.from(json, "utf8");
    const embed = payments.embed({ data: [data] });
    this.psbt.addOutput({
      script: embed.output!,
      value: 0,
    });
  }

  public async build(): Promise<void> {
    await this.fetchUtxos();
    await this.calculateFee();
    this.selectInputs();
    this.addOutputs();
    this.addDunestoneData();
  }

  public finalize(): Transaction {
    const signer = toTaprootSigner(this.options.walletSigner);
    this.psbt.signAllInputs(signer);
    this.psbt.finalizeAllInputs();
    return this.psbt.extractTransaction();
  }

  public getPsbt(): Psbt {
    return this.psbt;
  }
}

export function getDunestoneTransaction(
  json: unknown,
  options: DunestoneTransactionOptions
): BoxedResponse<DunestoneTransaction, string> {
  const parsed = DunestoneSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message || "Invalid Dunestone";
    return new BoxedError("ValidationError", issue);
  }
  const tx = new DunestoneTransaction(parsed.data, options);
  return new BoxedSuccess(tx);
}
