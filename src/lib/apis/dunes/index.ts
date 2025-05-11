import { DUNES_RPC_URL } from "@/lib/consts";
import {
  Dune,
  DuneUtxoBalance,
  DunesBalanceResponse,
  DunesFetchError,
  DunesUtxo,
  DuneHoldersResponse,
  AllDunesResponse,
} from "./types";
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

export async function dunesrpc_getDuneUtxoBalances(
  address: string
): Promise<BoxedResponse<DuneUtxoBalance[], DunesFetchError>> {
  const url = `${DUNES_RPC_URL}/dunes/utxos/balances/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      DunesFetchError.UnknownError,
      `Failed to fetch UTXO balances from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  const response = Array.isArray(json) ? json : [];

  return new BoxedSuccess(response as DuneUtxoBalance[]);
}

export async function dunesrpc_getduneinfo(
  protocolId: string
): Promise<BoxedResponse<Dune, DunesFetchError>> {
  const url = `${DUNES_RPC_URL}/dunes/etchings/info/${protocolId}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      DunesFetchError.UnknownError,
      `Failed to fetch dune info from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as Dune);
}

export async function dunesrpc_getDuneHolders(
  protocolId: string,
  page: number = 1,
  limit: number = 100
): Promise<BoxedResponse<DuneHoldersResponse, DunesFetchError>> {
  const url = `${DUNES_RPC_URL}/dunes/etchings/holders/${protocolId}?page=${page}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      DunesFetchError.UnknownError,
      `Failed to fetch holders from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as DuneHoldersResponse);
}

export async function dunesrpc_getAllDunes(
  page: number = 1,
  limit: number = 100
): Promise<BoxedResponse<AllDunesResponse, DunesFetchError>> {
  const url = `${DUNES_RPC_URL}/dunes/etchings/all?page=${page}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      DunesFetchError.UnknownError,
      `Failed to fetch all dunes from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as AllDunesResponse);
}
