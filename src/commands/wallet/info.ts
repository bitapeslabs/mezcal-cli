import fs from "fs";
import path from "path";
import chalk from "chalk";

import { Command } from "@/commands/base";
import { SavedWallet } from "@/lib/crypto/wallet";
import { bip32, firstTaprootAddress } from "@/lib/crypto/wallet";
import { GIT_ISSUE_URL, WALLET_PATH } from "@/lib/consts";

export default class WalletInfo extends Command {
  static override description =
    "Show information about your current wallet address";
  static override examples = ["$ dunes wallet info"];

  public override async run(): Promise<void> {
    const target = WALLET_PATH;

    if (!fs.existsSync(target)) {
      this.error(`No wallet found at ${target}`);
      return;
    }

    const walletFile = await fs.promises.readFile(target, "utf8");
    let parsed: SavedWallet;

    try {
      parsed = JSON.parse(walletFile);
    } catch {
      this.error(
        `Failed to parse wallet file – corrupted or invalid format. Please create an issue here: ${GIT_ISSUE_URL}`
      );
      return;
    }

    if (!parsed.bip86AccountZeroXPUB) {
      this.error(
        `No xpub found in wallet file! Please create an issue here: ${GIT_ISSUE_URL}`
      );
      return;
    }

    try {
      const root = bip32.fromBase58(parsed.bip86AccountZeroXPUB);
      const address = firstTaprootAddress(root, true);
      this.log(`Your Address: ${chalk.yellow.bold(address)}`);
    } catch (err) {
      console.log(err);
      this.error(
        `Failed to derive address from xpub. Please create an issue here: ${GIT_ISSUE_URL}`
      );
    }
  }
}
