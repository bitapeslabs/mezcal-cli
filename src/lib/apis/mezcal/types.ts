export enum MezcalFetchError {
  UnknownError = "UnknownError",
}

export type Mezcal = {
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
};
export interface MezcalBalanceResponse {
  address: string;
  balances: {
    [protocolId: string]: {
      balance: string;
      mezcal: Mezcal;
    };
  };
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
