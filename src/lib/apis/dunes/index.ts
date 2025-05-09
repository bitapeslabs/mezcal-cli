import { DUNES_RPC_URL } from "@/lib/consts";
import { DunesBalanceResponse, DunesFetchError, DunesUtxo } from "./types";
import { BoxedResponse, BoxedSuccess, BoxedError } from "@/lib/utils/boxed";

export async function dunesrpc_getdunebalances(
  address: string
): Promise<BoxedResponse<DunesBalanceResponse, DunesFetchError>> {
  const url = `${DUNES_RPC_URL}/dunes/balances/address/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      DunesFetchError.UnknownError,
      `Failed to fetch dune balances from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  return new BoxedSuccess(
    (Object.keys(json).length ? json : { balances: {} }) as DunesBalanceResponse
  );
}

export async function dunesrpc_getutxos(
  address: string
): Promise<BoxedResponse<DunesUtxo[], DunesFetchError>> {
  const url = `${DUNES_RPC_URL}/utxos/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      DunesFetchError.UnknownError,
      `Failed to fetch UTXOs from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  const response = Array.isArray(json) ? json : [];
  return new BoxedSuccess(response as DunesUtxo[]);
}
