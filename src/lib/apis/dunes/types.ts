export enum DunesFetchError {
  UnknownError = "UnknownError",
}

export interface Dune {
  dune_protocol_id: string;
  name: string;
  symbol: string;
  total_supply: string;
  decimals: number;
  premine: string;
  mints: string;
  price_amount: string | null;
  price_pay_to: string | null;
  mint_cap: string | null;
  mint_start: number | null;
  mint_end: number | null;
  mint_offset_start: number | null;
  mint_offset_end: number | null;
  mint_amount: string | null;
  burnt_amount: string;
  unmintable: number;
  etch_transaction: string;
  deployer_address: string;
}

export interface DunesBalanceResponse {
  address: string;
  balances: {
    [protocolId: string]: {
      balance: string;
      dune: Dune;
    };
  };
}
export type DunesUtxo = {
  id: string;
  value_sats: string;
  block: number;
  vout_index: number;
  block_spent: number | null;
  transaction: string | null;
  transaction_spent: string | null;
};

export interface DuneUtxoBalance {
  balance: string;
  utxo: DunesUtxo;
  dune: Dune;
}

export type ParsedUtxoBalance = DuneUtxoBalance & {
  balance: bigint;
};
