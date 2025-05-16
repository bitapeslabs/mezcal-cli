import chalk from "chalk";
import ora from "ora";

import { Command } from "@/commands/base";
import { Mezcal } from "@/lib/apis/mezcal/types";
import { mezcalrpc_getAllMezcals } from "@/lib/apis/mezcal";
import { isBoxedError } from "@/lib/utils/boxed";
import { DEFAULT_ERROR } from "@/lib/consts";

// padding helpers
const padEnd = (s: string, w: number) =>
  s.length >= w ? s : s + " ".repeat(w - s.length);

const pageSize = 25;

function getMintStatus(mezcal: Mezcal): string {
  if (mezcal.mint_amount === null || mezcal.mint_cap === null) {
    return chalk.gray("NOT MINTABLE");
  }

  const minted = BigInt(mezcal.mints);
  const cap = BigInt(mezcal.mint_cap);
  const percent = ((Number(minted) / Number(cap)) * 100).toFixed(2);

  return `${minted}/${cap} (${chalk.yellow(`${percent}%`)} minted)`;
}

export default class AllMezcals extends Command {
  static override description = "List all Mezcals with mint status";
  static override examples = ["$ mezcal list", "$ mezcal list 2"];

  public override async run(argv: string[]): Promise<void> {
    const page = Math.max(parseInt(argv[0] || "1", 10) || 1, 1);

    const spinner = ora("Fetching Mezcals…").start();
    const response = await mezcalrpc_getAllMezcals(page, pageSize);
    spinner.stop();

    if (isBoxedError(response)) {
      this.error(response.message || DEFAULT_ERROR);
      return;
    }

    const { etchings: mezcal, total_etchings: total, limit } = response.data;
    const totalPages = Math.ceil(total / limit);

    this.log(chalk.bold(`\nMezcals — Page ${page} of ${totalPages}\n`));

    const COL_ID = 18;
    const COL_NAME = 28;
    const COL_STATUS = 36;

    this.log(
      chalk.bold(
        `${padEnd("Mezcal ID", COL_ID)} ${padEnd("Name", COL_NAME)} ${padEnd(
          "Status",
          COL_STATUS
        )}`
      )
    );

    mezcal.forEach((mezcal) => {
      const id = padEnd(mezcal.mezcal_protocol_id, COL_ID);
      const name = padEnd(mezcal.name, COL_NAME);
      const status = padEnd(getMintStatus(mezcal), COL_STATUS);

      this.log(`${chalk.cyan(id)} ${chalk.gray(name)} ${status}`);
    });

    this.log(
      chalk.gray(
        `\nShowing ${mezcal.length} of ${total} total Mezcals (page size ${limit}).`
      )
    );
  }
}
