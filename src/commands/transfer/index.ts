import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { z } from "zod";
import { EXPLORER_URL } from "@/lib/consts";
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
import { CURRENT_BTC_TICKER, DEFAULT_ERROR } from "@/lib/consts";
import type { WalletSigner } from "@/lib/crypto/wallet";
import { SingularTransfer } from "@/lib/dunes";
import { Dune } from "@/lib/apis/dunes/types";
import { parseBalance } from "@/lib/dunes/utils";
// ────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────
const U32 = z
  .string()
  .regex(/^\d+$/)
  .refine(
    (s) => {
      const n = Number(s);
      return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
    },
    { message: "u32 required (0‑4294967295)" }
  );

// Expected order: <address> <asset|name|id> <amount>
const TransferLineSchema = z.string().refine(
  (line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3) return false;
    const [, asset, amount] = parts;

    if (!/^\d+(\.\d+)?$/.test(amount)) return false;

    if (asset.toLowerCase() === "btc") return true;
    if (asset.includes(":")) {
      const [blk, tx] = asset.split(":");
      return U32.safeParse(blk).success && U32.safeParse(tx).success;
    }

    // else treat as name: syntactically any word is okay
    return true;
  },
  { message: "<address> <btc|duneId|duneName> <amount>" }
);

// Simple Levenshtein (small strings)
const lev = (a: string, b: string) => {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
  return dp[m][n];
};

// ────────────────────────────────────────────────────────────
export default class WalletTransfer extends Command {
  static override description = `Interactively build & broadcast ${CURRENT_BTC_TICKER} / Dune transfers`;
  static override examples = [
    "$ dunes wallet transfer",
    "bc1… btc 0.001",
    "bc1… 859:1 10",
    "bc1… BobToken 5",
  ];
  private balances: Record<string, number> = {};
  private transfers: SingularTransfer[] = [];
  private divCache: Record<string, number> = {};
  private nameLookup: Record<string, Dune> = {};
  private reverseNameLookup: Record<string, Dune> = {};

  // ── basic utils ──────────────────────────────────────────
  private btcToSats(str: string): number {
    const [whole, frac = ""] = str.split(".");
    return Number(
      BigInt(whole) * 100000000n + BigInt((frac + "00000000").slice(0, 8))
    );
  }

  private async duneDecimals(id: string): Promise<number> {
    if (this.divCache[id] !== undefined) return this.divCache[id];
    const resp = await dunesrpc_getduneinfo(id);
    if (isBoxedError(resp)) throw new Error(resp.message);
    this.divCache[id] = resp.data.decimals ?? 0;
    return this.divCache[id];
  }

  // fuzzy‑match name → {id,decimals}
  private async pickName(raw: string) {
    const lc = raw.toLowerCase();
    if (this.nameLookup[lc]) return this.nameLookup[lc];

    const ranked = Object.keys(this.nameLookup)
      .map((n) => ({ n, d: lev(lc, n) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    if (!ranked.length || ranked[0].d > 3)
      throw new Error(`Unknown Dune name '${raw}'.`);

    this.log(chalk.yellow("Did you mean:"));
    ranked.forEach((r, i) => this.log(`  ${i + 1}. ${r.n}`));

    const { pick } = await inquirer.prompt<{ pick: number }>([
      {
        type: "number",
        name: "pick",
        message: "Select 1‑3 or 0 to cancel:",
        default: 1,
        validate: (v) =>
          v && v >= 0 && v <= ranked.length ? true : `0‑${ranked.length}`,
      },
    ]);
    if (pick === 0) throw new Error("Transfer entry cancelled");
    return this.nameLookup[ranked[pick - 1].n];
  }

  // ── preview helper ──────────────────────────────────────
  private preview() {
    if (!this.transfers.length) return;
    this.log("\n" + chalk.bold("Current transfers:"));
    this.transfers.forEach((t, i) => {
      const num = chalk.grey(`#${i + 1}`);
      if (t.asset === "btc") {
        this.log(
          `${num} ${chalk.yellow(CURRENT_BTC_TICKER)} → ${chalk.yellow(
            t.amount.toLocaleString()
          )} sats to ${chalk.gray(t.address)}`
        );
      } else {
        let asset = this.reverseNameLookup[t.asset];

        this.log(
          `${num} ${chalk.cyan(asset.name)} (${chalk.gray(
            t.asset
          )}) → ${chalk.green(
            "(" + asset.symbol + ") " + t.amount.toString()
          )} to ${chalk.gray(t.address)}`
        );
      }
    });
  }

  // ── interactive collection ─────────────────────────────
  private async collectTransfers() {
    this.log(chalk.bold("\nEnter transfers one per line in the format:"));
    this.log(chalk.cyan('<address> <duneId|"btc"> <amount>'));
    this.log(
      chalk.gray(
        "Type '/send' when you are done, or '/back' to remove the last entry."
      )
    );

    while (true) {
      const { line } = await inquirer.prompt<{ line: string }>([
        {
          type: "input",
          name: "line",
          message: `Transfer #${this.transfers.length + 1} >`,
          validate: (v) => {
            if (v === "/send" || v === "/back") return true;

            const parseResult = TransferLineSchema.safeParse(v).success;

            if (!parseResult) {
              return "Format error";
            }

            const parts = v.trim().split(/\s+/);
            if (parts.length !== 3) return false;
            const [, asset, amount] = parts;

            if (asset.toLowerCase() === "btc") {
              if (Number(this.balances[asset]) < Number(amount)) {
                return `Insufficient balance for '${asset}'`;
              }
            } else if (asset.includes(":")) {
              let dune = this.reverseNameLookup[asset];

              if (!dune) {
                return `Unknown Dune ID '${asset}'`;
              }
              if (
                BigInt(this.balances[dune.dune_protocol_id]) < BigInt(amount)
              ) {
                return `Insufficient balance for '${dune.name}'`;
              }
            } else {
              let dune = this.nameLookup[asset.toLowerCase()];
              if (
                BigInt(this.balances[dune.dune_protocol_id]) < BigInt(amount)
              ) {
                return `Insufficient balance for '${dune.name}'`;
              }
            }

            return true;
          },
        },
      ]);

      if (line === "/send") {
        if (!this.transfers.length) {
          this.warn("No transfers specified.");
          continue;
        }
        break;
      }
      if (line === "/back") {
        if (this.transfers.pop())
          this.log(chalk.yellow("Removed last transfer."));
        this.preview();
        continue;
      }

      const [address, assetRaw, amountRaw] = line.trim().split(/\s+/);

      try {
        if (assetRaw.toLowerCase() === "btc") {
          this.transfers.push({
            asset: "btc",
            amount: this.btcToSats(amountRaw),
            address,
          });
        } else if (assetRaw.includes(":")) {
          const decimals = await this.duneDecimals(assetRaw);
          this.transfers.push({
            asset: assetRaw,
            amount: BigInt(Number(amountRaw) * 10 ** decimals),
            address,
          });
        } else {
          const { dune_protocol_id: id, decimals } = await this.pickName(
            assetRaw
          );
          this.transfers.push({
            asset: id,
            amount: BigInt(Number(amountRaw) * 10 ** decimals),
            address,
          });
        }
      } catch (e: any) {
        this.warn(e.message);
      }

      this.preview();
    }
  }

  private async loadBalances(addr: string) {
    const [btcRes, duneRes] = await Promise.all([
      esplora_getaddressbalance(addr),
      dunesrpc_getdunebalances(addr),
    ]);

    this.balances["btc"] = 0;

    if (!isBoxedError(btcRes)) {
      this.balances["btc"] = btcRes.data;
      this.log(chalk.yellow.bold(`${CURRENT_BTC_TICKER} Balance:`));
      this.log(
        `  ${chalk.yellow.bold(`${btcRes.data} ${CURRENT_BTC_TICKER}`)}\n`
      );
    }

    if (!isBoxedError(duneRes)) {
      const bal = duneRes.data.balances;
      if (Object.keys(bal).length) {
        this.log(chalk.cyan.bold("Dune Balances:"));
        for (const [duneId, { balance, dune }] of Object.entries(bal)) {
          this.log(
            `  (${chalk.yellowBright(dune.name)}) ${chalk.green(
              dune.symbol
            )}: ${chalk.bold(
              Number(
                parseBalance(BigInt(balance), dune.decimals)
              ).toLocaleString("en-US")
            )}  ${chalk.gray(`[${duneId}]`)}`
          );
          this.balances[duneId] = Number(balance);
          this.nameLookup[dune.name.toLowerCase()] = dune;
          this.reverseNameLookup[duneId] = dune;
        }
      }
    }
  }

  public override async run() {
    // Wallet + signer
    const w = await getWallet(this);
    if (isBoxedError(w)) return this.error(w.message || DEFAULT_ERROR);

    const dec = await getDecryptedWalletFromPassword(this, w.data);
    if (isBoxedError(dec)) return this.error(dec.message || DEFAULT_ERROR);
    const signer: WalletSigner = dec.data.signer;

    const myAddr = w.data.currentAddress;
    this.log(chalk.gray(`Current address: ${myAddr}`));
    await this.loadBalances(myAddr);

    // Prompt transfers
    await this.collectTransfers();

    // Build tx
    const txRes = await getDunestoneTransaction(signer, {
      transfers: this.transfers,
    });
    if (isBoxedError(txRes)) {
      return this.error(txRes.message || DEFAULT_ERROR);
    }

    // Broadcast
    const bSpin = ora("Broadcasting...").start();
    const br = await esplora_broadcastTx(txRes.data.toHex());
    if (isBoxedError(br)) {
      bSpin.fail("Broadcast error");
      return this.error(br.message || DEFAULT_ERROR);
    }
    bSpin.succeed("Broadcasted!");
    this.log("TX: " + chalk.gray(`${EXPLORER_URL}/tx/${br.data}`));
  }
}
