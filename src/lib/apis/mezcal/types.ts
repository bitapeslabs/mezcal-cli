export enum MezcalFetchError {
  UnknownError = "UnknownError",
}

export interface Mezcal {
  id: number;
  mezcal_protocol_id: string;
  block: number; // This field is not in the Sequelize model, but it's part of the type
  name: string;
  symbol: string;
  total_supply: string;
  decimals: number;
  premine: string;
  mints: string;
  price:
    | {
        amount: number;
        pay_to: string;
      }[]
    | null; // Postgres-only, can be null

  mint_cap: string | null;
  mint_start: number | null;
  mint_end: number | null;
  mint_offset_start: number | null;
  mint_offset_end: number | null;
  mint_amount: string | null;
  burnt_amount: string | null;
  etch_transaction_id: string | null; // BIGINT → string
  deployer_address_id: string | null; // BIGINT → string
  unmintable: number;
  total_holders: number;
  etch_transaction: string;
  deployer_address: string;
}

export interface WebMezcalBalance {
  balance: string;
  protocol_id: string;
  mezcal: Mezcal;
}

export interface WebMezcalBalanceResponse {
  address: string;
  balances: {
    [protocolId: string]: WebMezcalBalance;
  };
  page: number;
  limit: number;
  totalBalances: number;
  totalPages: number;
}

export type EventType = "ETCH" | "MINT" | "TRANSFER" | "BURN";

export interface MezcalEvent {
  id: string;
  type: EventType;
  block: number;
  amount?: string | null;
  from_address?: string | null;
  to_address?: string | null;
  transaction: string;
  mezcal: Mezcal | null;
}

export interface MezcalEventsResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  data: MezcalEvent[];
}

export interface MezcalBalanceResponse {
  address: string;
  balances: {
    [protocolId: string]: {
      balance: string;
      mezcal: Mezcal;
    };
  };
  page: number;
  limit: number;
  totalBalances: number;
  totalPages: number;
}
export type MezcalUtxo = {
  id: string;
  value_sats: string;
  block: number;
  vout_index: number;
  block_spent: number | null;
  transaction: string | null;
  transaction_spent: string | null;
};

export type AllMezcalBalancesResponse = {
  address: string;
  balances: {
    [protocolId: string]: {
      balance: string;
      mezcal: Mezcal;
    };
  };
};

export interface MezcalUtxoBalance {
  balance: string;
  utxo: MezcalUtxo;
  mezcal: Mezcal;
}

export type ParsedUtxoBalance = MezcalUtxoBalance & {
  balance: bigint;
};

// single address + balance
export interface MezcalHolder {
  address: string;
  balance: string; // comes back as DECIMAL‑string
}

export interface MezcalHoldersResponse {
  total_holders: number; // total unique addresses holding >0
  page: number; // current page (1‑based)
  limit: number; // page size
  holders: MezcalHolder[];
}

export interface AllMezcalsResponse {
  total_etchings: number;
  page: number;
  limit: number;
  etchings: Mezcal[];
}

export type MezcalTransactionAsset = {
  /** “protocol-id” for Mezcals or “btc” for on-chain BTC */
  id: string;
  name: string;
  symbol: string;
  decimals: number;
};

export type MezcalTransactionTarget = "incoming" | "outgoing";

export type MezcalTransactionType =
  | "ETCH"
  | "MINT"
  | "TRANSFER"
  | "BURN"
  | "AIRDROP";

export type MezcalTransaction = {
  type: MezcalTransactionType;
  confirmed: boolean;
  target: MezcalTransactionTarget;
  target_address: string;
  asset: MezcalTransactionAsset;
  /** raw amount value as delivered by the API */
  amount: string;
  transaction_id: string;
  /** UNIX epoch (seconds) */
  timestamp: number;
};

export type MezcalTransactionsResponse = MezcalTransaction[];
