#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
pub mod errors;
pub mod instructions;
pub use instructions::*;
pub mod state;

declare_id!("38es8xcEeKMcwoGjG8iapa5JN7rs9zCCGKLRtUo9uKmS");

#[program]
pub mod anchor_escrow {
    use super::*;
    pub fn make(ctx: Context<Make>, seed: u64, amount: u64) -> Result<()> {
        instructions::make::handler(ctx, seed, amount)
    }
    pub fn take(ctx: Context<Take>) -> Result<()> {
        instructions::take::handler(ctx)
    }
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }
}