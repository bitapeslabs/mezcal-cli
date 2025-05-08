import { ELECTRUM_API_URL } from "@/lib/consts";
import { EsploraAddressResponse, EsploraFetchError } from "./types";
import { satsToBTC } from "@/lib/crypto/utils";
import {
  BoxedResponse,
  BoxedError,
  BoxedSuccess,
  isBoxedError,
} from "@/lib/utils/boxed";

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
