import { ELECTRUM_API_URL, GAS_MULTIPLIER } from "@/lib/consts";
import {
  EsploraAddressResponse,
  EsploraFetchError,
  EsploraUtxo,
  IEsploraSpendableUtxo,
  IEsploraTransaction,
} from "./types";
import { getEsploraTransactionWithHex, satsToBTC } from "@/lib/crypto/utils";
import {
  BoxedResponse,
  BoxedError,
  BoxedSuccess,
  isBoxedError,
} from "@/lib/utils/boxed";
import { get } from "http";
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

  const utxos: Omit<EsploraUtxo, "prevtx_hex">[] = await res.json();

  // 1. Deduplicate txids
  const uniqueTxids = [...new Set(utxos.map((u) => u.txid))];

  // 2. Fetch raw tx hex for each txid in parallel
  const rawTxMap = new Map<string, string>();
  await Promise.all(
    uniqueTxids.map(async (txid) => {
      const txUrl = `${ELECTRUM_API_URL}/tx/${txid}/hex`;
      const txRes = await fetch(txUrl);
      if (txRes.ok) {
        const hex = await txRes.text();
        rawTxMap.set(txid, hex);
      } else {
        rawTxMap.set(txid, ""); // still return something, maybe log if needed
      }
    })
  );

  // 3. Attach prevtx_hex to each UTXO
  const enriched: EsploraUtxo[] = utxos.map((u) => ({
    ...u,
    prevtx_hex: rawTxMap.get(u.txid) ?? "",
  }));

  return new BoxedSuccess(enriched);
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

export async function esplora_getbulktransactions(
  txids: string[]
): Promise<BoxedResponse<IEsploraTransaction[], EsploraFetchError>> {
  const url = `${ELECTRUM_API_URL}/txs`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txs: txids }),
  });
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

export const esplora_getspendableinputs = async (
  inputs: EsploraUtxo[]
): Promise<BoxedResponse<IEsploraSpendableUtxo[], EsploraFetchError>> => {
  let fullTransactionsResponse = await esplora_getbulktransactions(
    inputs.map((input) => input.txid)
  );

  if (isBoxedError(fullTransactionsResponse)) {
    return fullTransactionsResponse;
  }

  const inputsMap = new Map(inputs.map((input) => [input.txid, input]));

  const fullTransactions = fullTransactionsResponse.data;

  let response: IEsploraSpendableUtxo[] = [];

  for (const tx of fullTransactions) {
    const input = inputsMap.get(tx.txid);
    if (!input) {
      return new BoxedError(
        EsploraFetchError.UnknownError,
        `Input not found in inputs map for txid: ${tx.txid}`
      );
    }
    response.push({
      ...input,
      prevTx: getEsploraTransactionWithHex(tx),
    });
  }
  return new BoxedSuccess(response);
};
