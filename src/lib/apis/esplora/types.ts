export enum EsploraFetchError {
  UnknownError = "UnknownError",
}

export type EsploraAddressStats = {
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
  tx_count: number;
};

export type EsploraAddressResponse = {
  address: string;
  chain_stats: EsploraAddressStats;
  mempool_stats: EsploraAddressStats;
};

export type EsploraUtxo = {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
};
