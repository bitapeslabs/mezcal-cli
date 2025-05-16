import sade from "sade";
import chalk from "chalk";
import commands from "./commands";

const prog = sade("mezcal");

prog
  .version("0.8.0")
  .describe(chalk.yellow("The official Mezcals utility CLI"));

Object.entries(commands).forEach(([name, CommandClass]) => {
  let cmd = prog
    .command(name.replaceAll(":", " "))
    .describe(CommandClass.description ?? "");

  // ✅ Add flags to the command *before* .action()
  if (CommandClass.flags) {
    Object.entries(CommandClass.flags).forEach(([flag, type]) => {
      cmd = cmd.option(`--${flag}`, type.description ?? "");
    });
  }

  // ✅ Attach the .action at the end
  cmd.action(async (...args: any[]) => {
    const opts = args.pop();
    const positionals = opts._ ?? [];

    const commandInstance = new CommandClass();
    try {
      await commandInstance.run(positionals, opts);
    } catch (err) {
      console.log(err);
      commandInstance.error?.(err instanceof Error ? err.message : String(err));
    }
  });
});
prog.parse(process.argv);
