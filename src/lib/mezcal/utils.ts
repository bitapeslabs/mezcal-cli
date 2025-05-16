export const parseBalance = (amount: bigint, decimals: number): string => {
  const decimalPlaces = Math.pow(10, decimals);
  const wholePart = amount / BigInt(decimalPlaces);
  const fractionalPart = amount % BigInt(decimalPlaces);
  const formattedFractionalPart = fractionalPart
    .toString()
    .padStart(decimals, "0");
  return `${wholePart}.${formattedFractionalPart}`;
};
