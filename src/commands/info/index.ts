import chalk from "chalk";
import ora from "ora";
import { z } from "zod";

import { Command } from "@/commands/base";
import {
  dunesrpc_getduneinfo,
  dunesrpc_getDuneHolders,
} from "@/lib/apis/dunes";
import { isBoxedError } from "@/lib/utils/boxed";
import { DEFAULT_ERROR } from "@/lib/consts";
import { parseBalance } from "@/lib/dunes/utils";

export default class DuneInfo extends Command {
  static override description =
    "Show metadata and top holders for a Dune asset";
  static override examples = ["$ dunes info 859:1"];

  public override async run(argv: string[]): Promise<void> {
    const [duneId] = argv;
    if (!duneId) return this.error("Usage: dunes info <block:tx | dunename>");

    // ── fetch asset info
    const metaSpin = ora(`Fetching metadata…`).start();
    const infoRes = await dunesrpc_getduneinfo(duneId);

    metaSpin.stop();
    if (isBoxedError(infoRes))
      return this.error(infoRes.message || DEFAULT_ERROR);
    const d = infoRes.data;

    // ── fetch first page of holders
    const holderSpin = ora("Fetching holders…").start();
    const holdRes = await dunesrpc_getDuneHolders(duneId, 1, 10);
    holderSpin.stop();
    if (isBoxedError(holdRes))
      return this.error(holdRes.message || DEFAULT_ERROR);
    const h = holdRes.data;

    // ── pretty‑print metadata
    const num = (n: string | null) =>
      n == null ? "—" : Number(n).toLocaleString();
    const opt = (v: string | null) => (v == null ? "—" : v);

    let isFlex = d.mint_amount === "0" && d?.price_amount;

    const rows: [string, string][] = [
      ["Has flex mint enabled", isFlex ? "yes" : "no"],
      ["Protocol ID", d.dune_protocol_id],
      ["Name", d.name],
      ["Symbol", d.symbol],
      ["Decimals", d.decimals.toString()],
      ["Total supply", num(d.total_supply)],
      ["Premine", num(d.premine)],
      ["Minted", num(d.mints)],
      ["Burnt", num(d.burnt_amount)],
      ["Unmintable", d.unmintable ? "yes" : "no"],
      ["Price amount", opt(d.price_amount)],
      ["Price pay‑to", opt(d.price_pay_to)],
      ["Mint cap", opt(d.mint_cap)],
      [
        "Mint window",
        d.mint_start == null && d.mint_end == null
          ? "—"
          : `${d.mint_start ?? ""} → ${d.mint_end ?? ""}`,
      ],
      ["Etch tx", d.etch_transaction],
      ["Deployer", d.deployer_address],
    ];

    this.log(chalk.bold.cyan("\nDune asset info\n"));
    rows.forEach(([k, v]) =>
      this.log(`${chalk.gray(k.padEnd(14))} : ${chalk.yellowBright(v)}`)
    );

    // ── holders section
    this.log(
      `\n${chalk.bold.green(
        `Top holders (${h.total_holders.toLocaleString()} total)`
      )}`
    );

    if (!h.holders.length) {
      this.log("  — none yet —");
      return;
    }

    h.holders.forEach((entry, i) => {
      const balNum = Number(
        parseBalance(BigInt(entry.balance), d.decimals)
      ).toLocaleString("en-US");
      this.log(
        `  ${i + 1}. ${chalk.gray(entry.address)}  ` +
          `→ ${chalk.green(`(${d.symbol})`)} ${chalk.yellow(balNum)}`
      );
    });

    if (h.total_holders > h.holders.length) {
      this.log(
        chalk.gray(
          `  …plus ${(
            h.total_holders - h.holders.length
          ).toLocaleString()} more (use ?page=N)`
        )
      );
    }
  }
}
