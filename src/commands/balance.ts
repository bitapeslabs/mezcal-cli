import fs from "fs";
import chalk from "chalk";

import { Command } from "@/commands/base";
import { WALLET_PATH, GIT_ISSUE_URL } from "@/lib/consts";
import { SavedWallet, bip32, firstTaprootAddress } from "@/lib/crypto/wallet";
import { esplora_getaddressbalance } from "@/lib/apis/esplora";
import { isBoxedError } from "@/lib/utils/boxed";

export default class Balance extends Command {
  static override description =
    "Show the confirmed BTC balance of your wallet address";
  static override examples = ["$ dunes balance"];

  public override async run(): Promise<void> {
    if (!fs.existsSync(WALLET_PATH)) {
      this.error(`No wallet found at ${WALLET_PATH}`);
      return;
    }

    let parsed: SavedWallet;
    try {
      const walletFile = await fs.promises.readFile(WALLET_PATH, "utf8");
      parsed = JSON.parse(walletFile);
    } catch {
      this.error(
        `Failed to parse wallet file – corrupted or invalid.\nReport: ${GIT_ISSUE_URL}`
      );
      return;
    }

    if (!parsed.bip86AccountZeroXPUB) {
      this.error(`No xpub found in wallet file! Report: ${GIT_ISSUE_URL}`);
      return;
    }

    try {
      const root = bip32.fromBase58(parsed.bip86AccountZeroXPUB);
      const address = firstTaprootAddress(root, true);

      this.log(chalk.gray(`Your Wallet Address:  ${chalk.gray(address)}\n`));

      const result = await esplora_getaddressbalance(address);
      if (isBoxedError(result)) {
        this.error(`Failed to fetch balance: ${result.message}`);
        return;
      }

      const btc = result.data;
      this.log(chalk.yellow.bold("BTC Balance:"));
      this.log(`  ${chalk.yellow.bold(`${btc} BTC`)}\n`);
      this.log(chalk.cyan.bold("Dunes: "));
    } catch (err) {
      console.error(err);
      this.error(`Unexpected error occurred. Report: ${GIT_ISSUE_URL}`);
    }
  }
}
