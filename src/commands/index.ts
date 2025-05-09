import WalletGenerate from "./wallet/generate";
import WalletRecover from "./wallet/recover";
import WalletShowSeed from "./wallet/reveal";
import Wallets from "./wallets/index";
import WalletShowAddress from "./wallet/info";
import ConfigSet from "./config/set";
import ConfigShow from "./config/show";
import Config from "./config/index";
import { Command } from "./base";
import Balance from "./balance";
import Etch from "./etch";
import WalletSwitch from "./wallet/switch";

export const commands: Record<string, typeof Command> = {
  wallets: Wallets,
  "wallet:switch": WalletSwitch,
  "wallet:generate": WalletGenerate,
  "wallet:recover": WalletRecover,
  "wallet:reveal": WalletShowSeed,
  "wallet:info": WalletShowAddress,
  "config:set": ConfigSet,
  "config:show": ConfigShow,
  etch: Etch,
  balance: Balance,
  config: Config, // Alias for config:show
};

export default commands;
