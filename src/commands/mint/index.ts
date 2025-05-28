import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { z } from "zod";

import { Command } from "@/commands/base";
import {
  mezcalrpc_getmezcalinfo,
  mezcalrpc_getMezcalHolders,
} from "@/lib/apis/mezcal";
import {
  esplora_getaddressbalance,
  esplora_broadcastTx,
} from "@/lib/apis/esplora";
import { getWallet, getDecryptedWalletFromPassword } from "../shared";
import { isBoxedError } from "@/lib/utils/boxed";
import { getMezcalstoneTransaction, SingularBTCTransfer } from "@/lib/mezcal";
import { CURRENT_BTC_TICKER, DEFAULT_ERROR, EXPLORER_URL } from "@/lib/consts";
import type { WalletSigner } from "@/lib/crypto/wallet";
import { Mezcal } from "@/lib/apis/mezcal/types";
import { btcToSats } from "@/lib/crypto/utils";
import { submitTxToMara } from "@/lib/apis/mara";
export default class Mint extends Command {
  static override description =
    "Mint a Mezcal token you already etched (if mintable)";
  static override examples = ["$ mezcal mint 3911:1"];

  public override async run(argv: string[]): Promise<void> {
    const [mezcalId] = argv;
    if (!mezcalId)
      return this.error("Usage: mezcal mint <block:tx | mezcalName>");

    // fetch Mezcal info
    const spin = ora("Fetching mezcal info…").start();
    const infoRes = await mezcalrpc_getmezcalinfo(mezcalId);
    spin.stop();
    if (isBoxedError(infoRes))
      return this.error(infoRes.message || DEFAULT_ERROR);

    const mezcal = infoRes.data as Mezcal;

    // mintability check
    if (mezcal.mint_amount === null) {
      return this.error("This mezcal is unmintable.");
    }

    let isFlex = mezcal.price != null && mezcal.mint_amount == "0";

    // if price defined → warn & confirm
    let transfersNeeded: { satCost: number; payTo: string }[] = [];
    if (mezcal.price && !isFlex) {
      const totalPayment = mezcal.price.reduce(
        (acc, price) => acc + price.amount,
        0
      );
      mezcal.price.forEach((price) => {
        transfersNeeded.push({
          satCost: price.amount,
          payTo: price.pay_to,
        });
      });
      const btcCost = (totalPayment / 1e8).toFixed(8);
      this.log(
        chalk.yellow(
          `\nThis mezcal has a cost of ${totalPayment.toLocaleString()} sats (${btcCost} ${CURRENT_BTC_TICKER}) to mint, payable to ${JSON.stringify(
            mezcal.price.map((p) => p.pay_to).join(", ")
          )}.`
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

    if (isFlex && mezcal.price) {
      this.log(chalk.green(`✔ Mezcal has flex mint enabled`));

      this.log(
        chalk.yellow(
          `\nUnlimited minting, the cost is ${
            mezcal.price[0].amount
          } sat(s) per ${(1 / 10 ** mezcal.decimals).toFixed(
            mezcal.decimals
          )} ${mezcal.name}`
        )
      );
      const { amount } = await inquirer.prompt<{ amount: number }>([
        {
          type: "input",
          name: "amount",
          message: `Enter how many units of ${mezcal.name} you want to mint (0 to cancel):`,
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
      transfersNeeded.push({
        satCost: mezcal.price[0].amount * amount,
        payTo: mezcal.price[0].pay_to,
      });
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
    if (transfersNeeded.length > 0) {
      let satCost = transfersNeeded.reduce(
        (acc, transfer) => acc + transfer.satCost,
        0
      );
      const balRes = await esplora_getaddressbalance(
        walletRes.data.currentAddress
      );
      if (isBoxedError(balRes))
        return this.error(balRes.message || DEFAULT_ERROR);
      if (btcToSats(balRes.data) < satCost + 546) {
        return this.error(
          `Insufficient ${CURRENT_BTC_TICKER} balance. Need at least ${
            satCost + 546
          } sats (including dust output).`
        );
      }
    }

    // build tx
    const transfers = transfersNeeded.map(
      (transfer) =>
        ({
          address: transfer.payTo,
          amount: transfer.satCost,
          asset: "btc",
        } as SingularBTCTransfer)
    );

    const mezcalTx = await getMezcalstoneTransaction(signer, {
      partialMezcalstone: { mint: infoRes.data.mezcal_protocol_id },
      transfers: transfers,
    });
    if (isBoxedError(mezcalTx))
      return this.error(mezcalTx.message || DEFAULT_ERROR);

    // broadcast
    const brSpin = ora("Broadcasting…").start();
    const response = mezcalTx.data.useMaraPool
      ? await submitTxToMara(mezcalTx.data.tx.toHex())
      : await esplora_broadcastTx(mezcalTx.data.tx.toHex());

    brSpin.stop();
    if (isBoxedError(response))
      return this.error(response.message || DEFAULT_ERROR);

    this.log(chalk.green("Mint transaction broadcasted!"));
    this.log("TX: " + chalk.gray(`${EXPLORER_URL}/tx/${response.data}`));
  }
}
