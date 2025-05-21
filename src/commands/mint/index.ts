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
  esplora_submittxthroughproviders,
} from "@/lib/apis/esplora";
import { getWallet, getDecryptedWalletFromPassword } from "../shared";
import { isBoxedError } from "@/lib/utils/boxed";
import { getMezcalstoneTransaction, SingularBTCTransfer } from "@/lib/mezcal";
import { CURRENT_BTC_TICKER, DEFAULT_ERROR, EXPLORER_URL } from "@/lib/consts";
import type { WalletSigner } from "@/lib/crypto/wallet";
import { Mezcal } from "@/lib/apis/mezcal/types";
import { btcToSats } from "@/lib/crypto/utils";

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

    let isFlex = mezcal.mint_amount === "0" && mezcal?.price_amount;

    // if price defined → warn & confirm
    let satCost = 0;
    let payTo = "";
    if (mezcal.price_amount && mezcal.price_pay_to && !isFlex) {
      satCost = Number(mezcal.price_amount); // already sats
      payTo = mezcal.price_pay_to;

      const btcCost = (satCost / 1e8).toFixed(8);
      this.log(
        chalk.yellow(
          `\nThis mezcal has a cost of ${satCost.toLocaleString()} sats (${btcCost} ${CURRENT_BTC_TICKER}) to mint, payable to ${payTo}`
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

    if (isFlex && mezcal.price_amount && mezcal.price_pay_to) {
      payTo = mezcal.price_pay_to;

      this.log(chalk.green(`✔ Mezcal has flex mint enabled`));

      this.log(
        chalk.yellow(
          `\nUnlimited minting, the cost is ${
            mezcal.price_amount
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
      satCost =
        Number(amount) *
        10 ** Number(mezcal.decimals) *
        Number(mezcal.price_amount);
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
          `Insufficient ${CURRENT_BTC_TICKER} balance. Need at least ${
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

    const txRes = await getMezcalstoneTransaction(signer, {
      partialMezcalstone: { mint: infoRes.data.mezcal_protocol_id },
      transfers: transfers,
    });
    if (isBoxedError(txRes)) return this.error(txRes.message || DEFAULT_ERROR);

    // broadcast
    const brSpin = ora("Broadcasting…").start();
    const br = await esplora_submittxthroughproviders(txRes.data.toHex());
    brSpin.stop();
    if (isBoxedError(br)) return this.error(br.message || DEFAULT_ERROR);

    this.log(chalk.green("Mint transaction broadcasted!"));
    this.log("TX: " + chalk.gray(`${EXPLORER_URL}/tx/${br.data}`));
  }
}
