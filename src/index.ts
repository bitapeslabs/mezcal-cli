import sade from "sade";
import chalk from "chalk";
import commands from "./commands";

const prog = sade("dunes");

prog
  .version("0.8.0")
  .describe(chalk.blueBright("CLI to some JavaScript string utilities"));

prog
  .command("split <string>")
  .describe(
    chalk.green("Split a string into substrings and display as an array")
  )
  .option("--first", chalk.gray("Display just the first substring"))
  .option("-s, --separator", chalk.gray("Separator character"), ",")
  .action((str: string, opts: { first?: boolean; separator: string }) => {
    const limit = opts.first ? 1 : undefined;
    const result = str.split(opts.separator, limit);
    console.log(
      chalk.cyan("Result:"),
      chalk.bold.magenta(JSON.stringify(result))
    );
  });

Object.entries(commands).forEach(([name, command]) => {
  prog
    .command(name.replaceAll(":", " "))
    .describe(command.description)
    .action(async (args: string[], opts: Record<string, unknown>) => {
      const commandInstance = new command();
      try {
        await commandInstance.run(args, opts);
      } catch (error) {
        commandInstance.error(`Error: ${error}`);
      }
    });
});

prog.parse(process.argv);
