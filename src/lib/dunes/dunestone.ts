import { z } from "zod";

/* ── 1. shared helpers ───────────────────────── */
const MAX_U128 = (1n << 128n) - 1n;
const MAX_U32 = 0xffff_ffff;
const MAX_U8 = 0xff;

export const duneAmount = z.string().refine(
  (s) => {
    try {
      const n = BigInt(s);
      return 0n <= n && n <= MAX_U128;
    } catch {
      return false;
    }
  },
  { message: "amount must be a decimal string within u128 range" }
);

const u32 = () => z.number().int().nonnegative().max(MAX_U32);
const u8 = () => z.number().int().nonnegative().max(MAX_U8);

/* ── 2. new PriceTerms schema ───────────────────────── */
export const PriceTermsSchema = z.object({
  amount: duneAmount,
  pay_to: z.string().max(130, "pay_to address may be up to 130 chars"),
});

/* ── 3. existing schemas with additions/limits ───────── */
export const EdictSchema = z.object({
  id: z.string().regex(/^\d+:\d+$/, "id must look like “0:0”"),
  amount: duneAmount,
  output: u8(),
});

export const TermsSchema = z.object({
  price: PriceTermsSchema.optional(),
  amount: duneAmount,
  cap: duneAmount,
  height: z.tuple([u32().nullable(), u32().nullable()]),
  offset: z.tuple([u32().nullable(), u32().nullable()]),
});

export const MintSchema = z.object({
  block: u32(),
  tx: u32(),
});

export const EtchingSchema = z.object({
  divisibility: u8(),
  premine: duneAmount,
  dune: z
    .string()
    .regex(/^[A-Za-z0-9_.-]{1,31}$/)
    .min(1)
    .max(31),
  symbol: z
    .string()
    .min(1)
    .refine((s) => [...s].length === 1, {
      message: "symbol must be exactly one visible character or emoji",
    }),
  terms: z.union([TermsSchema, z.null()]),
  turbo: z.boolean().default(true),
});

export const DunestoneSchema = z
  .object({
    edicts: z.array(EdictSchema).optional(),
    etching: EtchingSchema.optional(),
    mint: MintSchema.optional(),
    pointer: u32().optional(),
  })
  .strict();

export type IPriceTerms = z.infer<typeof PriceTermsSchema>;
export type IEdict = z.infer<typeof EdictSchema>;
export type ITerms = z.infer<typeof TermsSchema>;
export type IMint = z.infer<typeof MintSchema>;
export type IEtching = z.infer<typeof EtchingSchema>;
export type IDunestone = z.infer<typeof DunestoneSchema>;
