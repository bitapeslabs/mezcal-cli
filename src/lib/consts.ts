import fs from "fs";
import path from "path";
import { networks } from "bitcoinjs-lib";
import envPaths from "env-paths";
const paths = envPaths("mezcal");

// Use the current working directory to resolve config/wallet paths
fs.mkdirSync(paths.data, { recursive: true });

export const CONFIG_PATH = path.resolve(paths.data, "config.json");
export const WALLET_PATH = path.resolve(paths.data, "wallet.json");
export const GIT_ISSUE_URL = "https://github.com/bitapeslabs/mezcal-cli/issues";

const defaults = {
  ELECTRUM_API_URL: "https://testnet.mezcal.sh",
  DUNES_RPC_URL: "https://api.mezcal.sh",
  EXPLORER_URL: "https://mempool.space/testnet",
  NETWORK: "testnet", // <- new default
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

export const BTC_TICKERS = {
  regtest: "rBTC",
  testnet: "tBTC",
  mainnet: "BTC",
} as const;

export const CURRENT_BTC_TICKER =
  BTC_TICKERS[defaults.NETWORK as keyof typeof BTC_TICKERS];

export const ELECTRUM_API_URL =
  configOverrides.ELECTRUM_API_URL ?? defaults.ELECTRUM_API_URL;

export const DUNES_RPC_URL =
  configOverrides.DUNES_RPC_URL ?? defaults.DUNES_RPC_URL;

export const EXPLORER_URL =
  configOverrides.EXPLORER_URL ?? defaults.EXPLORER_URL;

export const NETWORK =
  networks[
    (configOverrides.NETWORK ?? defaults.NETWORK) as keyof typeof networks
  ];

export const DEFAULT_ERROR =
  "An unknown error occurred. Please report it at " +
  GIT_ISSUE_URL +
  " with code:";

export const getChosenWallet = () => {
  const walletPath = path.resolve(process.cwd(), "wallet.json");
  if (!fs.existsSync(walletPath)) {
    return 0;
  }
  const walletJson = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  return walletJson.currentWalletIndex;
};

export let CHOSEN_WALLET = getChosenWallet();

export const setChosenWallet = (wallet: number) => {
  CHOSEN_WALLET = wallet;
};
