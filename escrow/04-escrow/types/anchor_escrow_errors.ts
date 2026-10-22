
export const AnchorEscrowErrorCode = {
  InvalidAmount: 6000,
  InvalidMaker: 6001,
  InvalidMint: 6002
};

export type AnchorEscrowErrorName = keyof typeof AnchorEscrowErrorCode;
