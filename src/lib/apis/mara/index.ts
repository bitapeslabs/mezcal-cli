import {
  BoxedError,
  type BoxedResponse,
  BoxedSuccess,
} from "@/lib/utils/boxed";
import { MARA_SLIPSTREAM_URL } from "@/lib/consts";
import { EsploraFetchError } from "../esplora/types";

export async function submitTxToMara(
  tx_hex: string
): Promise<BoxedResponse<string, EsploraFetchError>> {
  const url = `${MARA_SLIPSTREAM_URL}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tx_hex }),
  });

  if (!res.ok) {
    return new BoxedError(
      EsploraFetchError.UnknownError,
      `Failed to submit TX to Mara: ${res.status} ${res.statusText}`
    );
  }

  const txid = await res.json(); // Consume the response body to avoid memory leaks
  // On 200 OK we consider it a success — no need to parse body
  return new BoxedSuccess(txid.message);
}
