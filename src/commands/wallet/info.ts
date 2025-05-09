import fs from "fs";
import path from "path";
import chalk from "chalk";
import { NETWORK } from "@/lib/consts";
import { Command } from "@/commands/base";
import { SavedWallet } from "@/lib/crypto/wallet";
import { bip32, firstTaprootAddress } from "@/lib/crypto/wallet";
import { GIT_ISSUE_URL, WALLET_PATH } from "@/lib/consts";
import { getWallet } from "../shared";
import { isBoxedError } from "@/lib/utils/boxed";

export default class WalletInfo extends Command {
  static override description =
    "Show information about your current wallet address";
  static override examples = ["$ dunes wallet info"];

  public override async run(): Promise<void> {
    const target = WALLET_PATH;

    const walletResponse = await getWallet(this);

    if (isBoxedError(walletResponse)) {
      this.error(`Failed to fetch wallet: ${walletResponse.message}`);
      return;
    }

    try {
      this.log(
        `Your Address: ${chalk.yellow.bold(walletResponse.data.address)}`
      );
    } catch (err) {
      console.log(err);
      this.error(
        `Failed to derive address from xpub. Please create an issue here: ${GIT_ISSUE_URL}`
      );
    }
  }
}
