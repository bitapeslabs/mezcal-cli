import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { bip32 } from "@/lib/crypto/wallet";
import { BIP32Interface } from "bip32";
import * as bip39 from "bip39";
import { z } from "zod";
import { EXPLORER_URL, MARA_ENABLED } from "@/lib/consts";
import { Command } from "@/commands/base";
import {
  decryptWalletWithPassword,
  SavedWallet,
  getCurrentTaprootAddress,
} from "@/lib/crypto/wallet";
import {
  esplora_getutxos,
  esplora_getaddressbalance,
  esplora_getfee,
  esplora_broadcastTx,
} from "@/lib/apis/esplora";
import { getMezcalstoneTransaction } from "@/lib/mezcal";
import { getWitnessUtxo } from "@/lib/crypto/wallet";
import { DEFAULT_ERROR } from "@/lib/consts";
import { isBoxedError } from "@/lib/utils/boxed";
import { getDecryptedWalletFromPassword, getWallet } from "../shared";
import { IEtching, ITerms } from "@/lib/mezcal/mezcalstone";
import { ValidMezcalNameSchema } from "@/lib/mezcal/mezcalstone";
import { submitTxToMara } from "@/lib/apis/mara";

/**
 * Steps in the wizard.  Price‑collection is handled dynamically, so we don't
 * list priceAmount / pricePayTo here.
 */
export type Step =
  | "divisibility"
  | "premine"
  | "mezcal"
  | "symbol"
  | "turbo"
  | "includeTerms"
  | "amount"
  | "cap"
  | "heightMin"
  | "heightMax"
  | "offsetMin"
  | "offsetMax"
  | "includePrice";

export default class Etch extends Command {
  static override description = "Create a Mezcalstone etching and build a tx";
  static override examples = ["$ mezcal etch"];

  // ────────────────────────────────────────────────────────────────────────
  // Prompt loop – supports /back and unlimited price terms until /finish
  // ────────────────────────────────────────────────────────────────────────
  private async promptLoop(): Promise<Record<string, any>> {
    const state: Record<string, any> = {};

    const steps: Step[] = [
      "divisibility",
      "premine",
      "mezcal",
      "symbol",
      "turbo",
      "includeTerms",
      "amount",
      "cap",
      "heightMin",
      "heightMax",
      "offsetMin",
      "offsetMax",
      "includePrice",
    ];

    let idx = 0;
    while (idx < steps.length) {
      const step = steps[idx];
      const answer = await inquirer.prompt([
        this.getQuestion(step, state) as any,
      ]);

      // Allow user to navigate backwards
      if (answer[step] === "/back") {
        if (idx === 0) {
          this.warn("Already at first question");
        } else {
          delete state[step];
          idx -= 1;
        }
        continue;
      }

      state[step] = answer[step];

      // ─── Dynamic branching ────────────────────────────────────────────
      if (step === "includeTerms" && !answer.includeTerms) {
        // no terms → skip to end
        break;
      }

      if (step === "includePrice") {
        if (!answer.includePrice) {
          // user said no → proceed normally
          idx += 1;
          continue;
        }

        // Collect multiple price terms
        const priceTerms: { amount: string; pay_to: string }[] = [];
        while (true) {
          const { amount } = await inquirer.prompt([
            {
              type: "input",
              name: "amount",
              message:
                "Price.amount (u128 string) – or '/finish' to stop adding prices:",
              validate: (s: string) =>
                s === "/finish" || s.trim() !== "" ? true : "Cannot be empty",
            },
          ]);
          if (amount === "/finish") break;

          const { pay_to } = await inquirer.prompt([
            {
              type: "input",
              name: "pay_to",
              message:
                "Price.pay_to (max 130 chars) – or '/finish' to stop adding prices:",
              validate: (s: string) =>
                s === "/finish" || s.length <= 130
                  ? true
                  : "Must be ≤ 130 chars",
            },
          ]);
          if (pay_to === "/finish") break;

          priceTerms.push({ amount, pay_to });
          this.log(chalk.green(`✓ Added price term #${priceTerms.length}\n`));
        }
        state.priceTerms = priceTerms;
      }

      idx += 1;
    }

    return state;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Single‑question factory with conditional logic
  // ────────────────────────────────────────────────────────────────────────
  private getQuestion(step: Step, state: Record<string, any>) {
    switch (step) {
      case "divisibility":
        return {
          type: "number",
          name: step,
          message: "Divisibility (0‑255):",
          validate: (v: any) =>
            Number.isInteger(v) && v >= 0 && v <= 255
              ? true
              : "Enter u8 (0‑255)",
        } as const;
      case "premine":
        return {
          type: "input",
          name: step,
          message: "Premine amount (u128 string):",
        } as const;
      case "mezcal":
        return {
          type: "input",
          name: step,
          message: "Mezcal name (1‑31 chars, ONLY alphanumerics . _ -):",
          validate: (s: string) =>
            s === "/back" || ValidMezcalNameSchema.safeParse(s).success
              ? true
              : "Invalid name",
        } as const;
      case "symbol":
        return {
          type: "input",
          name: step,
          message: "Symbol (1 char, e.g., 🌵 or $):",
          validate: (s: string) =>
            s === "/back" || [...s].length === 1 ? true : "Must be 1 char",
        } as const;
      case "turbo":
        return {
          type: "confirm",
          name: step,
          message: "Enable turbo? (default yes)",
          default: true,
        } as const;
      case "includeTerms":
        return {
          type: "confirm",
          name: step,
          message: "Include Terms section?",
          default: false,
        } as const;
      case "amount":
      case "cap":
        return {
          when: () => state.includeTerms,
          type: "input",
          name: step,
          message: `Terms.${step} (u128 string):`,
        } as const;
      case "heightMin":
      case "heightMax":
        return {
          when: () => state.includeTerms,
          type: "input",
          name: step,
          message: `Terms.height ${
            step === "heightMin" ? "min" : "max"
          } (u32 or empty):`,
        } as const;
      case "offsetMin":
      case "offsetMax":
        return {
          when: () => state.includeTerms,
          type: "input",
          name: step,
          message: `Terms.offset ${
            step === "offsetMin" ? "min" : "max"
          } (u32 or empty):`,
        } as const;
      case "includePrice":
        return {
          when: () => state.includeTerms,
          type: "confirm",
          name: step,
          message: "Include price sub‑terms?",
          default: false,
        } as const;
      default:
        throw new Error("Unknown step");
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Main command entry point
  // ────────────────────────────────────────────────────────────────────────
  public override async run(): Promise<void> {
    const walletResponse = await getWallet(this);
    if (isBoxedError(walletResponse)) {
      this.error(`Failed to fetch wallet: ${walletResponse.message}`);
      return;
    }
    const wallet = walletResponse.data;

    const walletSignerResult = await getDecryptedWalletFromPassword(
      this,
      wallet
    );
    if (isBoxedError(walletSignerResult)) {
      this.error(`Failed to fetch mnemonic: ${walletSignerResult.message}`);
      return;
    }
    const { signer: walletSigner } = walletSignerResult.data;

    this.log(
      chalk.bold("\nMezcalstone Etching Wizard (type '/back' to go back)\n")
    );
    const answers = await this.promptLoop();

    const etching: IEtching = {
      divisibility: Number(answers.divisibility),
      premine: answers.premine,
      mezcal: answers.mezcal,
      symbol: answers.symbol,
      turbo: answers.turbo,
      terms: null,
    };

    // ─── Build Terms (if requested) ───────────────────────────────────────
    if (answers.includeTerms) {
      const terms: ITerms = {
        amount: answers.amount,
        height: [
          answers.heightMin ? Number(answers.heightMin) : null,
          answers.heightMax ? Number(answers.heightMax) : null,
        ],
        offset: [
          answers.offsetMin ? Number(answers.offsetMin) : null,
          answers.offsetMax ? Number(answers.offsetMax) : null,
        ],
      };

      if (answers.cap?.length) {
        terms.cap = answers.cap;
      }

      if (Array.isArray(answers.priceTerms) && answers.priceTerms.length > 0) {
        terms.price = answers.priceTerms; // ← multiple price terms supported now
      }

      etching.terms = terms;
    }

    let isFlex = etching?.terms?.price && etching?.terms.amount == "0";
    if (isFlex && etching?.terms?.price?.length !== 1) {
      this.error("Flex etching requires exactly one price term with amount 0.");
      return;
    }

    // ─── Build and broadcast transaction ────────────────────────────────
    const mezcalTx = await getMezcalstoneTransaction(walletSigner, {
      partialMezcalstone: { etching },
      transfers: [],
    });

    if (isBoxedError(mezcalTx)) {
      this.error(mezcalTx.message ?? DEFAULT_ERROR + `(etch-1)`);
      return;
    }

    const txSpinner = ora("Broadcasting transaction...").start();
    const response =
      mezcalTx.data.useMaraPool && MARA_ENABLED
        ? await submitTxToMara(mezcalTx.data.tx.toHex())
        : await esplora_broadcastTx(mezcalTx.data.tx.toHex());

    if (isBoxedError(response)) {
      txSpinner.fail("Failed to broadcast transaction.");
      this.error(response.message ?? DEFAULT_ERROR + `(etch-2)`);
      return;
    }

    const txid = response.data;
    txSpinner.succeed("Transaction broadcasted.");
    this.log("TX: " + chalk.gray(`${EXPLORER_URL}/tx/${txid}`));
  }
}
