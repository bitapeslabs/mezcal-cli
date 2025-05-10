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

// ── helpers ────────────────────────────────────────
const U32 = z
  .string()
  .regex(/^\d+$/)
  .refine((s) => {
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  }, "must be 0‑4294967295");

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
    if (!duneId) return this.error("Usage: dunes holders <block:tx> [page]");

    const [blk, tx] = duneId.split(":");
    if (!U32.safeParse(blk).success || !U32.safeParse(tx).success)
      return this.error("Dune id must be <block:u32>:<tx:u32>");

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
    const COL_BAL = 14;
    const COL_PCT = 9;
    this.log(
      chalk.bold(
        `${padEnd("Rank", COL_RANK)} ${padEnd("Address", COL_ADDR)} ${padStart(
          "Balance",
          COL_BAL
        )} ${padStart("Share", COL_PCT)}`
      )
    );

    // compute percentages against total supply if provided
    const supplyNum =
      data.total_holders && data.holders.length
        ? data.holders.reduce((acc, h) => acc + Number(h.balance), 0)
        : 0;

    const startRank = (page - 1) * data.limit;

    data.holders.forEach((h, idx) => {
      const rankStr = padEnd((startRank + idx + 1).toString() + ".", COL_RANK);
      const addrStr = padEnd(h.address, COL_ADDR);
      const balStr = padStart(
        Number(h.balance).toLocaleString("en-US"),
        COL_BAL
      );
      const pct =
        supplyNum > 0
          ? ((Number(h.balance) / supplyNum) * 100).toFixed(4) + "%"
          : "—";
      const pctStr = padStart(pct, COL_PCT);
      this.log(
        `${rankStr} ${chalk.gray(addrStr)} ${chalk.yellow(balStr)} ${chalk.gray(
          `(${pctStr} )`
        )}`
      );
    });

    this.log(
      chalk.gray(
        `\nShowing ${data.holders.length}/${data.total_holders} holders (page size ${data.limit}).`
      )
    );
  }
}
