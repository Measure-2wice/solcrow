use anchor_lang::prelude::*;
 
#[error_code]
pub enum EscrowError {
  #[msg("Invalid amount")]
  InvalidAmount,
  #[msg("Invalid maker")]
  InvalidMaker,
  #[msg("Invalid mint")]
  InvalidMint,
}