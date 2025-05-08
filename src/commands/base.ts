import chalk from "chalk";
import {} from "sade";

type Flag = {
  char: string;
  description: string;
};

type Flags = {
  [key: string]: Flag;
};

export class Command {
  static description: string;
  static examples: string[];
  static flags: Flags;

  error(message: string): never {
    console.error(`${chalk.red("✖ ERROR:")} ${message}`);
    process.exit(1);
  }

  warn(message: string): void {
    console.warn(`${chalk.yellow("⚠")} ${message}`);
  }

  log(message: string): void {
    console.log(`${chalk.cyan("›")} ${message}`);
  }

  run(args: string[], opts: Record<string, unknown>): Promise<void> {
    return this.error(
      "Command not implemented. Please override the run() method in your command class."
    );
  }
}
