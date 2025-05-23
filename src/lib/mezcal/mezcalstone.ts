import { z } from "zod";
/* ── 1. shared helpers ───────────────────────── */
const MAX_U128 = (1n << 128n) - 1n;
const MAX_U32 = 0xffff_ffff;
const MAX_U8 = 0xff;
const MAX_SATOSHI_EVER_IN_CIRCULATION = 2100000000000000;

const isValidU128 = (s: string) => {
  try {
    const n = BigInt(s);
    return 0n <= n && n <= MAX_U128;
  } catch {
    return false;
  }
};

const satoshi = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (
      Number.isSafeInteger(n) &&
      n >= 0 &&
      n <= MAX_SATOSHI_EVER_IN_CIRCULATION
    ) {
      return n; // ✅ successful cast
    }
  }
  return v; // ❌ leave as‑is (string)
}, z.number().int().nonnegative().max(MAX_SATOSHI_EVER_IN_CIRCULATION));

const mezcalAmount = z.string().refine(
  (s) => {
    return isValidU128(s) && s !== "";
  },
  { message: "amount must be a decimal string within u128 range" }
);

const u32 = () => z.number().int().nonnegative().max(MAX_U32);
const u8 = () => z.number().int().nonnegative().max(MAX_U8);

/* ── 2. new PriceTerms schema ───────────────────────── */
export const PriceTermsSchema = z.object({
  amount: satoshi, // Max amount of satoshi there will ever be (accepts string for legacy bigint)
  pay_to: z.string().max(130, "pay_to address may be up to 130 chars"),
});

/* ── helpers already defined: mezcalAmount, u8() ──────────────── */
const EdictTupleSchema = z
  .tuple([
    z.string().regex(/^\d+:\d+$/, "id must look like “0:0”"), // id
    mezcalAmount, // amount
    u8(), // output
  ])
  .transform(([id, amount, output]) => ({ id, amount, output })); // -> object

const EdictObjectSchema = z.object({
  id: z.string().regex(/^\d+:\d+$/, "id must look like “0:0”"),
  amount: mezcalAmount,
  output: u8(),
});

/* ── replace the old EdictSchema with a union that normalises ─── */
export const EdictSchema = z.union([EdictObjectSchema, EdictTupleSchema]);

export const TermsSchema = z.object({
  price: PriceTermsSchema.optional(),
  amount: mezcalAmount,
  cap: mezcalAmount.optional().nullable(),
  height: z.tuple([u32().nullable(), u32().nullable()]),
  offset: z.tuple([u32().nullable(), u32().nullable()]),
});

export const MintSchema = z
  .string()
  .regex(/^\d+:\d+$/, "mint must look like 'block:tx'")
  .transform((val) => {
    const [blockStr, txStr] = val.split(":");
    const block = Number(blockStr);
    const tx = Number(txStr);

    if (
      !Number.isInteger(block) ||
      block < 0 ||
      block > MAX_U32 ||
      !Number.isInteger(tx) ||
      tx < 0 ||
      tx > MAX_U32
    ) {
      throw new Error("block and tx must be valid u32 integers");
    }

    return `${block}:${tx}`;
  });

export const EtchingSchema = z.object({
  divisibility: z.number().int().nonnegative().max(18), //Avoid jeet precision
  premine: mezcalAmount,
  mezcal: z
    .string()
    .regex(/^[a-z0-9-]+$/) // only lowercase alphanumeric and hyphens
    .min(1)
    .max(15),
  symbol: z
    .string()
    .min(1)
    .refine((s) => [...s].length === 1, {
      message: "symbol must be exactly one visible character or emoji",
    }),
  terms: z.union([TermsSchema, z.null()]),
  turbo: z.boolean().default(true),
});

export const AMOUNT_KEYS = new Set(["amount", "cap", "premine"]);

export const MezcalstoneSchema = z
  .object({
    p: z.union([z.literal("mezcal"), z.literal("https://mezcal.sh")]),
    edicts: z.array(EdictSchema).optional(),
    etching: EtchingSchema.optional(),
    mint: MintSchema.optional(),
    pointer: u32().optional(),
  })
  .strict();

export type IPriceTerms = z.infer<typeof PriceTermsSchema>;
export type IEdictInput = z.input<typeof EdictSchema>; // for raw inputs
export type IEdict = z.output<typeof EdictSchema>; // for parsed result
export type ITerms = z.infer<typeof TermsSchema>;
export type IMint = z.infer<typeof MintSchema>;
export type IEtching = z.infer<typeof EtchingSchema>;
export type IMezcalstoneFull = z.infer<typeof MezcalstoneSchema>;

export type IMezcalstone = Omit<IMezcalstoneFull, "p"> & { p?: string };
export type IMezcalstoneInput = z.input<typeof MezcalstoneSchema>;
