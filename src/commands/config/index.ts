import chalk from "chalk";
import { Command } from "@/commands/base";

export default class Config extends Command {
  static override description = "Configuration commands for Mezcals CLI";
  static override examples = ["$ mezcal config"];

  public override async run(): Promise<void> {
    this.log(chalk.bold("Please specify what you'd like to do:\n"));
    this.log(
      `  • ${chalk.yellow("mezcal config show")}  ${chalk.gray(
        "→ show your current configuration"
      )}`
    );
    this.log(
      `  • ${chalk.yellow("mezcal config set")}   ${chalk.gray(
        "→ update Electrum or Mezcals RPC URLs"
      )}\n`
    );
    this.log(chalk.gray("Use --help with any command to see more options."));
  }
}
