import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { z } from "zod";

import { Command } from "@/commands/base";
import {
  esplora_getaddressbalance,
  esplora_broadcastTx,
} from "@/lib/apis/esplora";
import {
  dunesrpc_getdunebalances,
  dunesrpc_getduneinfo,
} from "@/lib/apis/dunes";
import { getWallet, getDecryptedWalletFromPassword } from "../shared";
import { isBoxedError } from "@/lib/utils/boxed";
import { getDunestoneTransaction } from "@/lib/dunes";
import { DEFAULT_ERROR, GIT_ISSUE_URL } from "@/lib/consts";
import type { WalletSigner } from "@/lib/crypto/wallet";
import { SingularTransfer } from "@/lib/dunes";

// ──────────────────────────────────────────────────────────────────────────────
// Helper schemas
// ──────────────────────────────────────────────────────────────────────────────
const U32 = z
  .string()
  .regex(/^\d+$/)
  .refine((s) => {
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  }, "must be 0‑4294967295");

const TransferLineSchema = z
  .custom<string>((val) => typeof val === "string")
  .refine((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3) return false;
    const [asset, amount] = parts;
    if (asset.toLowerCase() === "btc") {
      return /^\d+(\.\d+)?$/.test(amount);
    }
    // dune "block:tx"
    const [blk, tx] = asset.split(":");
    return (
      U32.safeParse(blk).success &&
      U32.safeParse(tx).success &&
      /^\d+(\.\d+)?$/.test(amount)
    );
  });

// ──────────────────────────────────────────────────────────────────────────────
// CLI Command
// ──────────────────────────────────────────────────────────────────────────────
export default class WalletTransfer extends Command {
  static override description =
    "Create & broadcast a transaction that sends BTC/Dune tokens";
  static override examples = [
    "$ dunes wallet transfer",
    "btc 0.001 bc1...",
    "859:1 10 bob1...",
    "/send",
  ];

  // Store collected transfers
  private transfers: SingularTransfer[] = [];
  private divisibilityCache: Record<string, number> = {};

  // ── Utilities ────────────────────────────────────────────────────────────
  private async fetchDivisibility(duneId: string): Promise<number> {
    if (this.divisibilityCache[duneId] !== undefined)
      return this.divisibilityCache[duneId];

    const infoResp = await dunesrpc_getduneinfo(duneId);
    if (isBoxedError(infoResp)) throw new Error(infoResp.message);
    const div = infoResp.data.decimals ?? 0;
    this.divisibilityCache[duneId] = div;
    return div;
  }

  private btcToSats(amount: string): number {
    // Allow "0.0001" etc.
    const [whole, frac = ""] = amount.split(".");
    const sats =
      BigInt(whole) * 100000000n + BigInt((frac + "00000000").slice(0, 8));
    return Number(sats);
  }

  // ── Prompt loop ───────────────────────────────────────────────────────────
  private async promptTransfers(): Promise<void> {
    this.log(chalk.bold("\nEnter transfers one per line in the format:"));
    this.log(chalk.cyan('  <duneId|"btc"> <amount> <address>'));
    this.log(
      chalk.gray(
        "Type '/send' when you are done, or '/back' to remove the last entry."
      )
    );

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { line } = await inquirer.prompt<{ line: string }>([
        {
          type: "input",
          name: "line",
          message:
            this.transfers.length === 0
              ? "Transfer >"
              : `Transfer #${this.transfers.length + 1} >`,
          validate: (input) => {
            if (input === "/send" || input === "/back") return true;
            return (
              TransferLineSchema.safeParse(input).success || "Invalid format"
            );
          },
        },
      ]);

      if (line === "/back") {
        if (this.transfers.length) {
          this.transfers.pop();
          this.log(chalk.yellow("Removed last transfer."));
        } else {
          this.warn("No transfers to remove.");
        }
        this.previewTransfers();
        continue;
      }
      if (line === "/send") {
        if (this.transfers.length === 0) {
          this.warn("No transfers specified.");
          continue;
        }
        break;
      }

      // Parse
      const [assetRaw, amountRaw, address] = line.trim().split(/\s+/);
      if (assetRaw.toLowerCase() === "btc") {
        const sats = this.btcToSats(amountRaw);
        this.transfers.push({ asset: "btc", amount: sats, address });
      } else {
        const [blk, tx] = assetRaw.split(":");
        const duneId = `${blk}:${tx}`;
        const decimals = await this.fetchDivisibility(duneId);
        const scaled = BigInt(Number(amountRaw) * 10 ** decimals);
        this.transfers.push({ asset: duneId, amount: scaled, address });
      }
      this.previewTransfers();
    }
  }

  // ── Balance preview ──────────────────────────────────────────────────────
  private async showBalances(addr: string): Promise<void> {
    const [btcResult, duneResult] = await Promise.all([
      esplora_getaddressbalance(addr),
      dunesrpc_getdunebalances(addr),
    ]);

    if (!isBoxedError(btcResult)) {
      this.log(
        `\n${chalk.yellow.bold("BTC Balance:")} ${chalk.yellow.bold(
          btcResult.data.toString()
        )} BTC`
      );
    }
    if (!isBoxedError(duneResult)) {
      const balances = duneResult.data.balances;
      if (Object.keys(balances).length === 0) {
        this.log(chalk.cyan("No Dunes in wallet."));
      } else {
        this.log(chalk.cyan.bold("Dune Balances:"));
        for (const [pid, { balance, dune }] of Object.entries(balances)) {
          this.log(
            `  ${chalk.yellowBright(dune.name)} (${dune.symbol}): ${chalk.bold(
              balance
            )}  ${chalk.gray(`[${pid}]`)}`
          );
        }
      }
    }
  }

  private previewTransfers(): void {
    if (this.transfers.length === 0) return;
    this.log("\n" + chalk.bold("Current transfer list:"));
    this.transfers.forEach((t, i) => {
      if (t.asset === "btc") {
        this.log(
          `  ${i + 1}. BTC  →  ${chalk.yellow(
            t.amount.toLocaleString()
          )} sats  to  ${chalk.gray(t.address)}`
        );
      } else {
        this.log(
          `  ${i + 1}. ${chalk.yellow(t.asset)} → ${chalk.green(
            t.amount.toString()
          )} units  to  ${chalk.gray(t.address)}`
        );
      }
    });
  }

  // ── Main run ─────────────────────────────────────────────────────────────
  public override async run(): Promise<void> {
    // Fetch wallet & signer
    const walletResp = await getWallet(this);
    if (isBoxedError(walletResp))
      return this.error(walletResp.message ?? DEFAULT_ERROR);
    const wallet = walletResp.data;

    const decrypt = await getDecryptedWalletFromPassword(this, wallet);
    if (isBoxedError(decrypt))
      return this.error(decrypt.message ?? DEFAULT_ERROR);
    const { signer }: { signer: WalletSigner } = decrypt.data;

    const addr = wallet.currentAddress;
    this.log(chalk.gray(`Current address: ${addr}`));

    await this.showBalances(addr);

    // Collect transfers
    await this.promptTransfers();

    // Build & broadcast transaction
    const spinner = ora("Building transaction...").start();
    const txResp = await getDunestoneTransaction(signer, {
      transfers: this.transfers,
    });
    if (isBoxedError(txResp)) {
      spinner.fail("Failed to build transaction");
      return this.error(txResp.message ?? DEFAULT_ERROR + " (transfer-1)");
    }
    spinner.succeed("Transaction built");

    const broadcastSpinner = ora("Broadcasting...").start();
    const broadcastResp = await esplora_broadcastTx(txResp.data.toHex());
    if (isBoxedError(broadcastResp)) {
      broadcastSpinner.fail("Broadcast failed");
      return this.error(
        broadcastResp.message ?? DEFAULT_ERROR + " (transfer-2)"
      );
    }

    broadcastSpinner.succeed("Broadcasted");
    this.log(`TxID: ${chalk.gray(broadcastResp.data)}`);
  }
}
