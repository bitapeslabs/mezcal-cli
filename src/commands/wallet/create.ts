import fs from "fs";
import { z } from "zod";
import inquirer from "inquirer";
import { firstTaprootAddress, generateWallet } from "@/lib/crypto/wallet";
import path from "path";
import chalk from "chalk";
import { Command } from "@/commands/base";
import { WALLET_PATH } from "@/lib/consts";

export default class WalletCreate extends Command {
  /* optional positional arg: where to write the wallet file */

  static override description = "Create an encrypted BIP39/BIP86 HD wallet";

  static override examples = ["$ dunes wallet create"];

  // ––––––––––––––––––––––––––––––––––––––––––––– //
  public override async run(
    args: string[],
    opts: Record<string, unknown>
  ): Promise<void> {
    const target = WALLET_PATH;

    if (fs.existsSync(target)) {
      this.error(
        `You already have a wallet on your system at ${target}. Use --help to see what you can do with it :)`
      );
      return;
    }

    const { password } = await inquirer.prompt<{ password: string }>([
      {
        type: "password",
        name: "password",
        message:
          "Choose a wallet password (keep it short & sweet; you'll use it often)",
        mask: "*",
        validate: (input: string) => {
          const PasswordSchema = z
            .string()
            .min(4, "too short – min 4 chars")
            .max(32, "too long – max 32 chars")
            .regex(/^\S+$/, "no spaces allowed");

          const result = PasswordSchema.safeParse(input);
          return result.success ? true : result.error.issues[0].message;
        },
      },
    ]);

    /* 2. create mnemonic & master node */
    const wallet = await generateWallet({ password });

    if (wallet.status === false) {
      this.error(`Failed to create wallet: ${wallet.errorType}`);
      return;
    }
    const { signer, mnemonic, walletJson } = wallet.data;

    /* 6. write to file (default ./wallet.json) */
    try {
      await fs.promises.writeFile(target, JSON.stringify(walletJson, null, 2), {
        flag: "w",
      });
    } catch (err: unknown) {
      this.error(`Failed to write wallet file: ${(err as Error).message}`);
      return;
    }

    /* 7. Done – print address & hint */
    this.log(chalk.green(`✓ Wallet saved to ${target}`));
    this.log(`Your Address: ${chalk.yellow.bold(firstTaprootAddress(signer))}`);
    this.log(
      `Your Mnemonic ${chalk.gray(
        `(write this down! you will need it to recover your wallet)`
      )}: ${chalk.yellow.bold(mnemonic)}`
    );
    this.log(
      "Keep your password safe – you will need it to unlock the wallet.\n"
    );
  }
}
