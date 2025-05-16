import chalk from "chalk";
import ora from "ora";

import { Command } from "@/commands/base";
import { CURRENT_BTC_TICKER, GIT_ISSUE_URL } from "@/lib/consts";
import { esplora_getaddressbalance } from "@/lib/apis/esplora";
import { mezcalrpc_getmezcalbalances } from "@/lib/apis/mezcal";
import { isBoxedError } from "@/lib/utils/boxed";
import { getWallet } from "../shared";
import { parseBalance } from "@/lib/mezcal/utils";
export default class Balance extends Command {
  static override description = `Show the confirmed ${CURRENT_BTC_TICKER} and Mezcal balances of your wallet address`;
  static override examples = ["$ mezcal balance"];

  public override async run(): Promise<void> {
    const walletResponse = await getWallet(this);

    if (isBoxedError(walletResponse)) {
      this.error(`Failed to fetch wallet: ${walletResponse.message}`);
      return;
    }

    try {
      const address = walletResponse.data.currentAddress;
      this.log(chalk.gray(`Current address:  ${chalk.gray(address)}\n`));

      const spinner = ora("Fetching balances...").start();

      const [btcResult, mezcalResult] = await Promise.all([
        esplora_getaddressbalance(address),
        mezcalrpc_getmezcalbalances(address),
      ]);

      spinner.stop();

      if (isBoxedError(btcResult)) {
        this.error(
          `Failed to fetch ${CURRENT_BTC_TICKER} balance: ${btcResult.message}`
        );
        return;
      }

      if (isBoxedError(mezcalResult)) {
        this.error(`Failed to fetch Mezcal balances: ${mezcalResult.message}`);
        return;
      }

      const btc = btcResult.data;
      this.log(chalk.yellow.bold(`${CURRENT_BTC_TICKER} Balance:`));
      this.log(`  ${chalk.yellow.bold(`${btc} ${CURRENT_BTC_TICKER}`)}\n`);

      const balances = mezcalResult.data?.balances;
      if (Object.keys(balances)?.length === 0) {
        this.log(chalk.cyan("No mezcals found in this wallet.\n"));
      } else {
        this.log(chalk.cyan.bold("Mezcal Balances:"));
        for (const [protocolId, { balance, mezcal }] of Object.entries(
          balances
        )) {
          this.log(
            `  (${chalk.yellowBright(mezcal.name)}) ` +
              `: ${chalk.green(mezcal.symbol)} ${chalk.bold(
                Number(
                  parseBalance(BigInt(balance), mezcal.decimals)
                ).toLocaleString("en-US")
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
