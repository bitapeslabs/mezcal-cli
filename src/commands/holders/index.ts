import chalk from "chalk";
import ora from "ora";
import { z } from "zod";

import { Command } from "@/commands/base";
import {
  dunesrpc_getDuneHolders,
  dunesrpc_getduneinfo,
} from "@/lib/apis/dunes";
import { isBoxedError } from "@/lib/utils/boxed";
import { DEFAULT_ERROR } from "@/lib/consts";
import { parseBalance } from "@/lib/dunes/utils";

const pageSize = 25;

// pad utilities
const padEnd = (s: string, w: number) =>
  s.length >= w ? s : s + " ".repeat(w - s.length);
const padStart = (s: string, w: number) =>
  s.length >= w ? s : " ".repeat(w - s.length) + s;

// ── command ────────────────────────────────────────
export default class Holders extends Command {
  static override description = "List holders for a Dune asset";
  static override examples = [
    "$ dunes holders 859:1",
    "$ dunes holders 859:1 3",
  ];

  public override async run(argv: string[]): Promise<void> {
    const [duneId, pageRaw] = argv;
    if (!duneId)
      return this.error("Usage: dunes holders <block:tx | dunename> [page]");

    const page = Math.max(parseInt(pageRaw || "1", 10) || 1, 1);

    const spin = ora("Fetching holders…").start();
    const resp = await dunesrpc_getDuneHolders(duneId, page, pageSize);
    const duneInfo = await dunesrpc_getduneinfo(duneId);
    spin.stop();

    if (isBoxedError(resp)) return this.error(resp.message || DEFAULT_ERROR);
    if (isBoxedError(duneInfo))
      return this.error(duneInfo.message || DEFAULT_ERROR);

    const data = resp.data;
    const totalPages = Math.ceil(data.total_holders / data.limit) || 1;
    this.log(
      `${chalk.yellow(
        `Holders for ${duneInfo.data.name} — page ${page} / ${totalPages}`
      )}`
    );

    // table header
    const COL_RANK = 4;
    const COL_ADDR = 64; // fits bech32m
    const COL_BAL = 20;
    this.log(
      chalk.bold(
        `${padEnd("Rank", COL_RANK)} ${padEnd("Address", COL_ADDR)} ${padEnd(
          "Balance",
          COL_BAL
        )}`
      )
    );

    const startRank = (page - 1) * data.limit;

    data.holders.forEach((h, idx) => {
      const rankStr = padEnd((startRank + idx + 1).toString() + ".", COL_RANK);
      const addrStr = padEnd(h.address, COL_ADDR);
      const balStr = padEnd(
        `${chalk.green(`(${duneInfo.data.symbol})`)} ${chalk.yellow(
          Number(
            parseBalance(BigInt(h.balance), duneInfo.data.decimals)
          ).toLocaleString("en-US")
        )}`,
        COL_BAL
      );

      this.log(`${rankStr} ${chalk.gray(addrStr)} ${balStr}`);
    });

    this.log(
      chalk.gray(
        `\nShowing ${data.holders.length}/${data.total_holders} holders (page size ${data.limit}).`
      )
    );
  }
}
