import { MEZCAL_RPC_URL } from "@/lib/consts";

import {
  type AllMezcalBalancesResponse,
  type AllMezcalsResponse,
  type Mezcal,
  type MezcalBalanceResponse,
  type MezcalEvent,
  type MezcalEventsResponse,
  MezcalFetchError,
  type MezcalHoldersResponse,
  type MezcalTransactionsResponse,
  type MezcalUtxo,
  type MezcalUtxoBalance,
  type WebMezcalBalance,
  type WebMezcalBalanceResponse,
} from "./types";

import {
  BoxedError,
  type BoxedResponse,
  BoxedSuccess,
} from "@/lib/utils/boxed";

export async function fetchMezcals(
  page = 1,
  limit = 10,
  status: "all" | "in-progress" | "completed" = "all",
  query = ""
): Promise<AllMezcalsResponse> {
  const url = new URL(`${MEZCAL_RPC_URL}/mezcal/etchings/all`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("status", status); // <-- backend must ignore if it doesn’t support it
  if (query) url.searchParams.set("q", query);

  const res = await fetch(url.toString()); // 60 s cache

  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as AllMezcalsResponse;

  return json;
}

export async function mezcalrpc_getAddressEvents(
  address: string,
  page = 1,
  limit = 25
): Promise<BoxedResponse<MezcalEventsResponse, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/events/address/${address}?page=${page}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch events from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  const final = {
    ...json,
    data: json.data.map((event: MezcalEvent) => ({
      ...event,
      mezcal: event.mezcal ?? null,
      id: event.id.toString(),
    })),
  };

  return new BoxedSuccess(final as MezcalEventsResponse);
}

export async function mezcalrpc_getallmezcalbalances(
  address: string
): Promise<BoxedResponse<AllMezcalBalancesResponse, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/balances/address/all/${address}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch all mezcal balances from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  return new BoxedSuccess(json as AllMezcalBalancesResponse);
}

export async function mezcalrpc_getmezcalbalances(
  address: string,
  page: number,
  limit: number
): Promise<BoxedResponse<WebMezcalBalanceResponse, MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/balances/address/${address}?page=${page}&limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch mezcal balances from ${url}: ${res.statusText}`
    );
  }

  const json = await res.json();

  const balancesResponse = (
    Object.keys(json).length ? json : { balances: {} }
  ) as MezcalBalanceResponse;

  balancesResponse.balances = Object.keys(balancesResponse.balances).reduce(
    (acc, key) => {
      return {
        ...acc,
        [key]: {
          ...balancesResponse.balances[key],
          balance: balancesResponse.balances[key].balance,
          protocol_id: key,
        },
      };
    },
    {} as Record<string, WebMezcalBalance>
  );

  return new BoxedSuccess(balancesResponse as WebMezcalBalanceResponse);
}

export async function mezcalrpc_getutxos(
  address: string
): Promise<BoxedResponse<MezcalUtxo[], MezcalFetchError>> {
  const url = `${MEZCAL_RPC_URL}/mezcal/utxos/${address}`;
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
  page = 1,
  limit = 100
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
  page = 1,
  limit = 100
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

export async function mezcalrpc_getAddressTransactions(
  address: string,
  lastSeenTxid?: string
): Promise<BoxedResponse<MezcalTransactionsResponse, MezcalFetchError>> {
  let url = `${MEZCAL_RPC_URL}/mezcal/transactions/address/${address}`;
  if (lastSeenTxid) url += `?last_seen_txid=${lastSeenTxid}`;

  const res = await fetch(url.toString());

  if (!res.ok) {
    return new BoxedError(
      MezcalFetchError.UnknownError,
      `Failed to fetch transactions from ${url}: ${res.statusText}`
    );
  }

  const json = (await res.json()) as MezcalTransactionsResponse;

  /* If your backend returns plain numbers for IDs or omits fields you need
     to coerce them here, similar to the events wrapper. For now we pass through. */
  return new BoxedSuccess(json);
}
