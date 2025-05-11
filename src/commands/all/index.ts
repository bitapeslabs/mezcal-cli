import chalk from "chalk";
import ora from "ora";

import { Command } from "@/commands/base";
import { Dune } from "@/lib/apis/dunes/types";
import { dunesrpc_getAllDunes } from "@/lib/apis/dunes";
import { isBoxedError } from "@/lib/utils/boxed";
import { DEFAULT_ERROR } from "@/lib/consts";

// padding helpers
const padEnd = (s: string, w: number) =>
  s.length >= w ? s : s + " ".repeat(w - s.length);

const pageSize = 25;

function getMintStatus(dune: Dune): string {
  if (dune.mint_amount === null || dune.mint_cap === null) {
    return chalk.gray("NOT MINTABLE");
  }

  const minted = BigInt(dune.mints);
  const cap = BigInt(dune.mint_cap);
  const percent = ((Number(minted) / Number(cap)) * 100).toFixed(2);

  return `${minted}/${cap} (${chalk.yellow(`${percent}%`)} minted)`;
}

export default class AllDunes extends Command {
  static override description = "List all Dunes with mint status";
  static override examples = ["$ dunes list", "$ dunes list 2"];

  public override async run(argv: string[]): Promise<void> {
    const page = Math.max(parseInt(argv[0] || "1", 10) || 1, 1);

    const spinner = ora("Fetching Dunes…").start();
    const response = await dunesrpc_getAllDunes(page, pageSize);
    spinner.stop();

    if (isBoxedError(response)) {
      this.error(response.message || DEFAULT_ERROR);
      return;
    }

    const { etchings: dunes, total_etchings: total, limit } = response.data;
    const totalPages = Math.ceil(total / limit);

    this.log(chalk.bold(`\nDunes — Page ${page} of ${totalPages}\n`));

    const COL_ID = 18;
    const COL_NAME = 28;
    const COL_STATUS = 36;

    this.log(
      chalk.bold(
        `${padEnd("Dune ID", COL_ID)} ${padEnd("Name", COL_NAME)} ${padEnd(
          "Status",
          COL_STATUS
        )}`
      )
    );

    dunes.forEach((dune) => {
      const id = padEnd(dune.dune_protocol_id, COL_ID);
      const name = padEnd(dune.name, COL_NAME);
      const status = padEnd(getMintStatus(dune), COL_STATUS);

      this.log(`${chalk.cyan(id)} ${chalk.gray(name)} ${status}`);
    });

    this.log(
      chalk.gray(
        `\nShowing ${dunes.length} of ${total} total Dunes (page size ${limit}).`
      )
    );
  }
}
