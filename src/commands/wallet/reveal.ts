import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import { z } from "zod";

import { Command } from "@/commands/base";

import {
  isValidMnemonic,
  SavedWallet,
  decryptMnemonicWithPassword,
} from "@/lib/crypto/wallet";
import { WALLET_PATH } from "@/lib/consts";

export default class WalletReveal extends Command {
  static override description =
    "Show the mnemonic phrase for your active wallet";
  static override examples = ["$ dunes wallet reveal"];

  public override async run(): Promise<void> {
    const target = WALLET_PATH;

    if (!fs.existsSync(target)) {
      this.error(
        `No wallet found at ${target}\n` +
          chalk.gray(`You can create one with: dunes wallet create`)
      );
      return;
    }
    const walletFile = await fs.promises.readFile(target, "utf8");
    let parsed: SavedWallet;

    try {
      parsed = JSON.parse(walletFile);
    } catch {
      this.error("Failed to parse wallet file – corrupted or invalid format");
      return;
    }

    if (!parsed.encryptedMnemonic) {
      this.error("No encrypted mnemonic found in wallet file.");
      return;
    }

    const { password } = await inquirer.prompt<{ password: string }>([
      {
        type: "password",
        name: "password",
        message: "Enter your wallet password to reveal the mnemonic:",
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

    try {
      const decrypted = decryptMnemonicWithPassword(
        parsed.encryptedMnemonic,
        password
      );

      const valid = await isValidMnemonic(decrypted);
      if (!valid) {
        this.error(
          "Decryption succeeded but the result is not a valid mnemonic"
        );
        return;
      }

      this.log(
        `Your mnemonic (keep this secure, do not share it):\n${chalk.yellow.bold(
          decrypted
        )}`
      );
    } catch (err: unknown) {
      this.error(
        "Failed to decrypt mnemonic. Did you enter the correct password?"
      );
    }
  }
}
