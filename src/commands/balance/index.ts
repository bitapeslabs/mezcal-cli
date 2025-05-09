import chalk from "chalk";
import ora from "ora";

import { Command } from "@/commands/base";
import { GIT_ISSUE_URL } from "@/lib/consts";
import { esplora_getaddressbalance } from "@/lib/apis/esplora";
import { dunesrpc_getdunebalances } from "@/lib/apis/dunes";
import { isBoxedError } from "@/lib/utils/boxed";
import { getWallet } from "../shared";

export default class Balance extends Command {
  static override description =
    "Show the confirmed BTC and Dune balances of your wallet address";
  static override examples = ["$ dunes balance"];

  public override async run(): Promise<void> {
    const walletResponse = await getWallet(this);

    if (isBoxedError(walletResponse)) {
      this.error(`Failed to fetch wallet: ${walletResponse.message}`);
      return;
    }

    try {
      const address = walletResponse.data.address;
      this.log(chalk.gray(`Your Wallet Address:  ${chalk.gray(address)}\n`));

      const spinner = ora("Fetching balances...").start();

      const [btcResult, duneResult] = await Promise.all([
        esplora_getaddressbalance(address),
        dunesrpc_getdunebalances(address),
      ]);

      spinner.stop();

      if (isBoxedError(btcResult)) {
        this.error(`Failed to fetch BTC balance: ${btcResult.message}`);
        return;
      }

      if (isBoxedError(duneResult)) {
        this.error(`Failed to fetch Dune balances: ${duneResult.message}`);
        return;
      }

      const btc = btcResult.data;
      this.log(chalk.yellow.bold("BTC Balance:"));
      this.log(`  ${chalk.yellow.bold(`${btc} BTC`)}\n`);

      const balances = duneResult.data?.balances;
      if (Object.keys(balances)?.length === 0) {
        this.log(chalk.cyan("No Dunes found in this wallet.\n"));
      } else {
        this.log(chalk.cyan.bold("Dune Balances:"));
        for (const [protocolId, { balance, dune }] of Object.entries(
          balances
        )) {
          this.log(
            `  (${chalk.yellowBright(dune.name)}) ` +
              `: ${chalk.green(dune.symbol)} ${chalk.bold(
                Number(balance).toLocaleString("en-US")
              )}   ${chalk.gray(`[${protocolId}]`)}`
          );
        }
      }
    } catch (err) {
      console.error(err);
      this.error(`Unexpected error occurred. Report: ${GIT_ISSUE_URL}`);
    }
  }
}
