import * as bip39 from "bip39";
import { BIP32Factory, BIP32Interface } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import { ecc } from "@/lib/crypto/ecc.js";

import { BoxedResponse, BoxedError, BoxedSuccess } from "./utils/boxed.js";

const bip32 = BIP32Factory(ecc);
bitcoin.initEccLib?.(ecc);

export function firstTaprootAddress(root: BIP32Interface): string {
  const child = root.derivePath("m/86'/0'/0'/0/0");
  const internalPubkey = Buffer.from(child.publicKey.subarray(1, 33)); // x‑only
  const { address } = bitcoin.payments.p2tr({
    internalPubkey,
    network: bitcoin.networks.bitcoin,
  });
  if (!address) throw new Error("failed to derive p2tr address");
  return address;
}

type EncryptedMnemonic = {
  kdf: string;
  cipher: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
};

// ––––– helper: simple AES‑256‑GCM encryption ––––– //
export function encryptMnemonic(
  mnemonic: string,
  password: string
): EncryptedMnemonic {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32); // KDF
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(mnemonic, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    kdf: "scrypt",
    cipher: "aes-256-gcm",
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: ciphertext.toString("hex"),
  };
}

export type SavedWallet = {
  encryptedMnemonic: EncryptedMnemonic;
  bip86AccountZeroXPUB: string;
};

export type BIP39Wallet = {
  mnemonic: string;
  seed: string;
  root: BIP32Interface;
  walletJson?: SavedWallet;
};

export async function generateWallet(opts: {
  from_mnemonic?: string;
  password: string;
}): Promise<BoxedResponse<BIP39Wallet, WalletError>> {
  const mnemonic = opts.from_mnemonic ?? bip39.generateMnemonic(128);
  try {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = bip32.fromSeed(seed);
    return new BoxedSuccess({
      mnemonic,
      seed: seed.toString("hex"),
      root,
      walletJson: {
        encryptedMnemonic: encryptMnemonic(mnemonic, opts.password),
        bip86AccountZeroXPUB: root.derivePath("m/86'/0'/0'").toBase58(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      return new BoxedError(WalletError.InvalidMnemonic, err.message);
    } else {
      return new BoxedError(WalletError.InvalidMnemonic, "Invalid mnemonic");
    }
  }
}

enum WalletError {
  InvalidMnemonic = "InvalidMnemonic",
}
