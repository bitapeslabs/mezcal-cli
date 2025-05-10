import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import { z } from "zod";

import { Command } from "@/commands/base";
import { getDecryptedWalletFromPassword, getWallet } from "../shared";
import { isBoxedError } from "@/lib/utils/boxed";

export default class WalletReveal extends Command {
  static override description =
    "Show the mnemonic phrase for your active wallet";
  static override examples = ["$ dunes wallet reveal"];

  public override async run(): Promise<void> {
    const walletResponse = await getWallet(this);

    if (isBoxedError(walletResponse)) {
      this.error(`Failed to fetch wallet: ${walletResponse.message}`);
      return;
    }

    const decryptedWalletResponse = await getDecryptedWalletFromPassword(
      this,
      walletResponse.data
    );

    if (isBoxedError(decryptedWalletResponse)) {
      this.error(
        `Failed to fetch mnemonic: ${decryptedWalletResponse.message}`
      );
      return;
    }

    const { mnemonic } = decryptedWalletResponse.data;

    this.log(
      `Your mnemonic (keep this secure, do not share it):\n${chalk.yellow.bold(
        mnemonic
      )}`
    );
  }
}
