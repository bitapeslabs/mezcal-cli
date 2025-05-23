import fs from "fs";
import chalk from "chalk";
import { Command } from "@/commands/base";
import {
  CONFIG_PATH,
  ELECTRUM_API_URL as DEFAULT_ELECTRUM_API_URL,
  MEZCAL_RPC_URL as DEFAULT_MEZCAL_RPC_URL,
  NETWORK as DEFAULT_NETWORK,
} from "@/lib/consts";

function loadConfig(): Partial<Record<string, string>> {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

export default class ConfigShow extends Command {
  static override description = "Show current Mezcals CLI configuration";
  static override examples = ["$ mezcal config show"];

  public override async run(): Promise<void> {
    const config = loadConfig();

    const electrum = config.ELECTRUM_API_URL || DEFAULT_ELECTRUM_API_URL;
    const mezcal = config.MEZCAL_RPC_URL || DEFAULT_MEZCAL_RPC_URL;
    const network = config.NETWORK || DEFAULT_NETWORK;

    this.log(chalk.bold("Current Mezcals CLI configuration:\n"));
    this.log(`  • ${chalk.yellow("electrum")}: ${chalk.gray(electrum)}`);
    this.log(`  • ${chalk.yellow("mezcal")}:    ${chalk.gray(mezcal)}`);
    this.log(`  • ${chalk.yellow("network")}:  ${chalk.gray(network)}\n`);
    this.log(
      chalk.gray(
        "To change settings, use: mezcal config set --electrum <url> --mezcal <url> --network <env>"
      )
    );
  }
}
