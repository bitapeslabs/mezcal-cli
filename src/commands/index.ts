import WalletCreate from "./wallet/create";
import WalletRecover from "./wallet/recover";
import WalletShowSeed from "./wallet/reveal";
import WalletShowAddress from "./wallet/info";
import ConfigSet from "./config/set";
import ConfigShow from "./config/show";
import Config from "./config/index";
import { Command } from "./base";
import Balance from "./balance";

export const commands: Record<string, typeof Command> = {
  "wallet:create": WalletCreate,
  "wallet:recover": WalletRecover,
  "wallet:reveal": WalletShowSeed,
  "wallet:info": WalletShowAddress,
  "config:set": ConfigSet,
  "config:show": ConfigShow,
  balance: Balance,
  config: Config, // Alias for config:show
};

export default commands;
