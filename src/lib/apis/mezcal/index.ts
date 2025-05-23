import { MEZCAL_RPC_URL } from "@/lib/consts";
import {
  Mezcal,
  MezcalUtxoBalance,
  MezcalBalanceResponse,
  MezcalFetchError,
  MezcalUtxo,
  MezcalHoldersResponse,
  AllMezcalsResponse,
} from "./types";
import { BoxedResponse, BoxedSuccess, BoxedError } from "@/lib/utils/boxed";

export async function mezcalrpc_getmezcalbalances(
  address: string
): Promise<BoxedResponse<MezcalBalanceResponse, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/balances/address/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch mezcal balances from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  return new BoxedSuccess(
    (Object.keys(json).length
      ? json
      : { balances: {} }) as MezcalBalanceResponse
  );
}

export async function mezcalrpc_getutxos(
  address: string
): Promise<BoxedResponse<MezcalUtxo[], MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/utxos/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch UTXOs from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  const response = Array.isArray(json) ? json : [];
  return new BoxedSuccess(response as MezcalUtxo[]);
}

export async function mezcalrpc_getMezcalUtxoBalances(
  address: string
): Promise<BoxedResponse<MezcalUtxoBalance[], MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/utxos/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch UTXO balances from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  const response = Array.isArray(json) ? json : [];

  return new BoxedSuccess(response as MezcalUtxoBalance[]);
}

export async function mezcalrpc_getmezcalinfo(
  protocolId: string
): Promise<BoxedResponse<Mezcal, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/etchings/info/${protocolId}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch mezcal info from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as Mezcal);
}

export async function mezcalrpc_getMezcalHolders(
  protocolId: string,
  page: number = 1,
  limit: number = 100
): Promise<BoxedResponse<MezcalHoldersResponse, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/etchings/holders/${protocolId}?page=${page}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch holders from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as MezcalHoldersResponse);
}

export async function mezcalrpc_getAllMezcals(
  page: number = 1,
  limit: number = 100
): Promise<BoxedResponse<AllMezcalsResponse, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/etchings/all?page=${page}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch all mezcal from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();
  return new BoxedSuccess(json as AllMezcalsResponse);
}
