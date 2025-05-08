import fs from "fs";
import path from "path";
import chalk from "chalk";
import { z } from "zod";
import { Command } from "@/commands/base";
import { CONFIG_PATH } from "@/lib/consts";

const UrlSchema = z.string().url("Must be a valid URL");
const NetworkSchema = z.enum(["mainnet", "testnet", "regtest"]);

function loadConfig(): Record<string, string> {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(data: Record<string, string>) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

export default class ConfigSet extends Command {
  static override description = "Set or show Dunes CLI configuration";
  static override examples = [
    "$ dunes config set --electrum https://regtest.anoa.io/api",
    "$ dunes config set --dunes http://api.dunes.sh",
    "$ dunes config set --network regtest",
    "$ dunes config set",
  ];

  static override flags = {
    electrum: z.string().optional().describe("Electrum API URL"),
    dunes: z.string().optional().describe("Dunes RPC URL"),
    network: NetworkSchema.optional().describe(
      "Network (mainnet | testnet | regtest)"
    ),
  };

  public override async run(args: string[], opts: Record<string, string>) {
    const config = loadConfig();
    let updated = false;

    if (opts.electrum) {
      const parsed = UrlSchema.safeParse(opts.electrum);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid electrum URL";
        this.error(`Invalid electrum URL: ${msg}`);
      }
      config.ELECTRUM_API_URL = opts.electrum;
      updated = true;
    }

    if (opts.dunes) {
      const parsed = UrlSchema.safeParse(opts.dunes);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid Dunes RPC URL";
        this.error(`Invalid Dunes RPC URL: ${msg}`);
      }
      config.DUNES_RPC_URL = opts.dunes;
      updated = true;
    }

    if (opts.network) {
      const parsed = NetworkSchema.safeParse(opts.network);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid network";
        this.error(`Invalid network: ${msg}`);
      }
      config.NETWORK = opts.network;
      updated = true;
    }

    if (updated) {
      saveConfig(config);
      this.log(chalk.green("✓ Configuration updated!"));
    } else {
      this.log(chalk.bold("Available Dunes CLI configuration: \n"));
      this.log(
        `  • ${chalk.yellow("electrum")}: ${chalk.gray(
          config.ELECTRUM_API_URL || "not set"
        )}`
      );
      this.log(
        `  • ${chalk.yellow("dunes")}:    ${chalk.gray(
          config.DUNES_RPC_URL || "not set"
        )}`
      );
      this.log(
        `  • ${chalk.yellow("network")}:  ${chalk.gray(
          config.NETWORK || "not set"
        )}\n`
      );
      this.log(
        chalk.gray(
          "To update, use: dunes config set --electrum <url> --dunes <url> --network <env>"
        )
      );
    }
  }
}
