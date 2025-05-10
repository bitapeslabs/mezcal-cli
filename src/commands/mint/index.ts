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

export default class Mint extends Command {
  static override description =
    "Mint a Dune token you already etched (if mintable)";
  static override examples = ["$ dunes mint 3911:1"];

  public override async run(argv: string[]): Promise<void> {
    const [duneId] = argv;
    if (!duneId) return this.error("Usage: dunes mint <block:tx | duneName>");

    // fetch Dune info
    const spin = ora("Fetching dune info…").start();
    const infoRes = await dunesrpc_getduneinfo(duneId);
    spin.stop();
    if (isBoxedError(infoRes))
      return this.error(infoRes.message || DEFAULT_ERROR);

    const dune = infoRes.data as Dune;

    // mintability check
    if (dune.mint_amount === null) {
      return this.error("This dune is unmintable.");
    }

    let isFlex = dune.mint_amount === "0" && dune?.price_amount;

    // if price defined → warn & confirm
    let satCost = 0;
    let payTo = "";
    if (dune.price_amount && dune.price_pay_to && !isFlex) {
      satCost = Number(dune.price_amount); // already sats
      payTo = dune.price_pay_to;

      const btcCost = (satCost / 1e8).toFixed(8);
      this.log(
        chalk.yellow(
          `\nThis dune has a cost of ${satCost.toLocaleString()} sats (${btcCost} BTC) to mint, payable to ${payTo}`
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

    if (isFlex && dune.price_amount && dune.price_pay_to) {
      payTo = dune.price_pay_to;

      this.log(chalk.green(`✔ Dune has flex mint enabled`));

      this.log(
        chalk.yellow(
          `\nUnlimited minting, the cost is ${dune.price_amount} sat(s) per ${(
            1 /
            10 ** dune.decimals
          ).toFixed(dune.decimals)} ${dune.name}`
        )
      );
      const { amount } = await inquirer.prompt<{ amount: number }>([
        {
          type: "input",
          name: "amount",
          message: `Enter how many units of ${dune.name} you want to mint (0 to cancel):`,
          validate: (input) => {
            const value = Number(input);
            if (isNaN(value)) return "Please enter a valid number.";
            if (value < 0) return "Amount must be greater than or equal to 0.";
            return true;
          },
        },
      ]);
      if (amount === 0) {
        this.log("Mint cancelled.");
        return;
      }
      satCost =
        Number(amount) *
        10 ** Number(dune.decimals) *
        Number(dune.price_amount);
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
      transfers: transfers,
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
