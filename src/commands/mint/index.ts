import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { z } from "zod";

import { Command } from "@/commands/base";
import {
  dunesrpc_getduneinfo,
  dunesrpc_getDuneHolders,
} from "@/lib/apis/dunes";
import {
  esplora_getaddressbalance,
  esplora_broadcastTx,
} from "@/lib/apis/esplora";
import { getWallet, getDecryptedWalletFromPassword } from "../shared";
import { isBoxedError } from "@/lib/utils/boxed";
import { getDunestoneTransaction, SingularBTCTransfer } from "@/lib/dunes";
import { DEFAULT_ERROR } from "@/lib/consts";
import type { WalletSigner } from "@/lib/crypto/wallet";
import { Dune } from "@/lib/apis/dunes/types";
import { btcToSats } from "@/lib/crypto/utils";
// u32:u32 validator
const U32 = z
  .string()
  .regex(/^\d+$/)
  .refine((s) => {
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  }, "must be 0‑4294967295");

export default class Mint extends Command {
  static override description =
    "Mint a Dune token you already etched (if mintable)";
  static override examples = ["$ dunes mint 3911:1"];

  public override async run(argv: string[]): Promise<void> {
    const [duneId] = argv;
    if (!duneId) return this.error("Usage: dunes mint <block:tx>");

    const [blk, tx] = duneId.split(":");
    if (!U32.safeParse(blk).success || !U32.safeParse(tx).success)
      return this.error("Dune id must be <block:u32>:<tx:u32>");

    // fetch Dune info
    const spin = ora("Fetching dune info…").start();
    const infoRes = await dunesrpc_getduneinfo(duneId);
    spin.stop();
    if (isBoxedError(infoRes))
      return this.error(infoRes.message || DEFAULT_ERROR);

    const dune = infoRes.data as Dune;

    // mintability check
    if (dune.mint_amount === null) {
      return this.error("This Dune asset is unmintable.");
    }

    // if price defined → warn & confirm
    let satCost = 0;
    let payTo = "";
    if (dune.price_amount && dune.price_pay_to) {
      satCost = Number(dune.price_amount); // already sats
      payTo = dune.price_pay_to;

      const btcCost = (satCost / 1e8).toFixed(8);
      this.log(
        chalk.yellow(
          `\nMinting costs ${satCost.toLocaleString()} sats (${btcCost} BTC) payable to ${payTo}`
        )
      );
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: "confirm",
          name: "confirm",
          message: "Proceed?",
          default: false,
        },
      ]);
      if (!confirm) {
        this.log("Mint cancelled.");
        return;
      }
    }

    // wallet & password
    const walletRes = await getWallet(this);
    if (isBoxedError(walletRes))
      return this.error(walletRes.message || DEFAULT_ERROR);

    const decryptRes = await getDecryptedWalletFromPassword(
      this,
      walletRes.data
    );
    if (isBoxedError(decryptRes))
      return this.error(decryptRes.message || DEFAULT_ERROR);
    const signer: WalletSigner = decryptRes.data.signer;

    // balance check
    if (satCost > 0) {
      const balRes = await esplora_getaddressbalance(
        walletRes.data.currentAddress
      );
      if (isBoxedError(balRes))
        return this.error(balRes.message || DEFAULT_ERROR);
      if (btcToSats(balRes.data) < satCost + 546) {
        return this.error(
          `Insufficient BTC balance. Need at least ${
            satCost + 546
          } sats (including dust output).`
        );
      }
    }

    // build tx
    const transfers =
      satCost > 0
        ? [
            {
              asset: "btc",
              amount: satCost,
              address: payTo,
            } as SingularBTCTransfer,
          ]
        : [];

    const txRes = await getDunestoneTransaction(signer, {
      partialDunestone: { mint: duneId },
      transfers: [],
    });
    if (isBoxedError(txRes)) return this.error(txRes.message || DEFAULT_ERROR);

    // broadcast
    const brSpin = ora("Broadcasting…").start();
    const br = await esplora_broadcastTx(txRes.data.toHex());
    brSpin.stop();
    if (isBoxedError(br)) return this.error(br.message || DEFAULT_ERROR);

    this.log(chalk.green("Mint transaction broadcasted!"));
    this.log(`TxID: ${chalk.gray(br.data)}`);
  }
}
