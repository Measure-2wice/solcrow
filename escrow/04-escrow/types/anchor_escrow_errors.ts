
export const AnchorEscrowErrorCode = {
  InvalidAmount: 6000,
  InvalidMaker: 6001,
  InvalidMintA: 6002,
  InvalidMintB: 6003
};

export type AnchorEscrowErrorName = keyof typeof AnchorEscrowErrorCode;
