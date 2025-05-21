import { ELECTRUM_API_URL, GAS_MULTIPLIER } from "@/lib/consts";
import {
  EsploraAddressResponse,
  EsploraFetchError,
  EsploraUtxo,
  IEsploraTransaction,
} from "./types";
import { satsToBTC } from "@/lib/crypto/utils";
import {
  BoxedResponse,
  BoxedError,
  BoxedSuccess,
  isBoxedError,
} from "@/lib/utils/boxed";
import { BACKUP_ELECTRUM_API_URL_1 } from "@/lib/consts";

export async function esplora_getaddress(
  address: string
): Promise<BoxedResponse<EsploraAddressResponse, EsploraFetchError>> {
  const url = `${ELECTRUM_API_URL}/address/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch address data from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as EsploraAddressResponse);
}

export async function esplora_getaddressbalance(
  address: string
): Promise<BoxedResponse<number, EsploraFetchError>> {
  let addressResponse = await esplora_getaddress(address);
  if (isBoxedError(addressResponse)) {
    return addressResponse;
  }
  const { chain_stats } = addressResponse.data;
  const balance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;

  return new BoxedSuccess(satsToBTC(balance));
}

export async function esplora_getutxos(
  address: string
): Promise<BoxedResponse<EsploraUtxo[], EsploraFetchError>> {
  const url = `${ELECTRUM_API_URL}/address/${address}/utxo`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch UTXOs from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as EsploraUtxo[]);
}

export async function esplora_getfee(): Promise<
  BoxedResponse<number, EsploraFetchError>
> {
  const url = `${ELECTRUM_API_URL}/fee-estimates`;

  const res = await fetch(url);
  if (!res.ok) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch fee estimates from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  if (!json["1"]) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Fee tier "1" not available in response`
    );
  }

  return new BoxedSuccess(Number(json["1"]) * GAS_MULTIPLIER);
}

export async function esplora_broadcastTx(
  rawHex: string,
  electrumProvider?: string
): Promise<BoxedResponse<string, EsploraFetchError>> {
  const url = `${electrumProvider ?? ELECTRUM_API_URL}/tx`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: rawHex,
  });

  if (!res.ok) {
    const msg = await res.text();
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to broadcast transaction: ${msg}`
    );
  }

  const txid = await res.text(); // response is just the txid as plain text
  return new BoxedSuccess(txid.trim());
}

/**
 * Fetch transactions for an address.
 * If `lastSeenTxid` is provided, fetch the *next* page after that tx
 * (Esplora’s “chain” pagination). Otherwise fetch the first page.
 */
export async function esplora_getaddresstxs(
  address: string,
  lastSeenTxid?: string
): Promise<BoxedResponse<IEsploraTransaction[], EsploraFetchError>> {
  const base = `${ELECTRUM_API_URL}/address/${address}/txs`;
  const url = lastSeenTxid ? `${base}/chain/${lastSeenTxid}` : base;

  const res = await fetch(url);
  if (!res.ok) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to fetch transactions from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  // Esplora returns an array; cast to our typed interface
  return new BoxedSuccess(json as IEsploraTransaction[]);
}

export async function esplora_submittxthroughproviders(
  tx: string
): Promise<BoxedResponse<string, EsploraFetchError>> {
  let results = await Promise.all([
    esplora_broadcastTx(tx),
    esplora_broadcastTx(tx, BACKUP_ELECTRUM_API_URL_1),
  ]);

  if (!isBoxedError(results[0])) {
    return new BoxedSuccess(results[0].data.trim());
  }

  if (!isBoxedError(results[1])) {
    return new BoxedSuccess(results[1].data.trim());
  }

  return new BoxedError(
    EsploraFetchError.UnknownError,
    `Failed to broadcast transaction: ${results[0].message} | ${results[1].message}`
  );
}
