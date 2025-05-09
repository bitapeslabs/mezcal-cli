import fs from "fs";
import path from "path";
import { networks } from "bitcoinjs-lib";

export const CONFIG_PATH = path.resolve(process.cwd(), "config.json");
export const WALLET_PATH = path.resolve(process.cwd(), "wallet.json");
export const GIT_ISSUE_URL = "https://github.com/bitapeslabs/dunes-cli/issues";

const defaults = {
  ELECTRUM_API_URL: "https://regtest.anoa.io/api",
  DUNES_RPC_URL: "http://api.dunes.sh",
  NETWORK: "regtest", // <- new default
};

type ConfigKeys = keyof typeof defaults;

let configOverrides: Partial<Record<ConfigKeys, string>> = {};
if (fs.existsSync(CONFIG_PATH)) {
  try {
    configOverrides = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    console.warn("[WARN] Failed to parse config.json – using defaults.");
  }
}

export const ELECTRUM_API_URL =
  configOverrides.ELECTRUM_API_URL ?? defaults.ELECTRUM_API_URL;

export const DUNES_RPC_URL =
  configOverrides.DUNES_RPC_URL ?? defaults.DUNES_RPC_URL;

export const NETWORK =
  networks[
    (configOverrides.NETWORK ?? defaults.NETWORK) as keyof typeof networks
  ];

export const DEFAULT_ERROR =
  "An unknown error occurred. Please report it at " +
  GIT_ISSUE_URL +
  " with code:";

export let CHOSEN_WALLET = 0;

export const setChosenWallet = (wallet: number) => {
  CHOSEN_WALLET = wallet;
};
