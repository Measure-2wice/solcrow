# Anchor Escrow

A trustless token move (escrow) program built with [Anchor](https://www.anchor-lang.com/) on Solana. Demonstrates PDAs as custodial vaults, `transfer_checked` CPIs, and the token interface — works with both legacy SPL Token and Token-2022 mints.

## Why Build an Escrow?

An escrow is one of the best programs to learn when getting started with Solana development. It covers essential concepts including:

- Creating and managing PDAs as custodial token vaults
- Cross-Program Invocations (CPIs) with `transfer_checked`
- Working with the token interface (`TokenInterface`) to support both SPL Token and Token-2022
- Closing accounts and returning rent to the correct party
- Enforcing on-chain invariants with `has_one` constraints

These patterns form the foundation for more complex DeFi programs like AMMs, lending protocols, and order books.

## Overview

Two parties — a **maker** and a **taker** — can move tokens without trusting each other or a third party. The maker deposits token A into a program-controlled vault. Any taker can complete the move. If no taker appears, the maker can reclaim their tokens at any time.

```
Maker deposits token A  →  vault (PDA-owned)
                                      ↓  vault releases token A to taker
                                      ↓  escrow + vault accounts closed, rent returned
```

## Program ID

```
38es8xcEeKMcwoGjG8iapa5JN7rs9zCCGKLRtUo9uKmS
```

## Prerequisites

- [Rust](https://rustup.rs/)
- [Solana CLI](https://solana.com/developers/guides/getstarted/setup-local-development)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) v1.0.0-rc.2
- [Node.js](https://nodejs.org/) + [Yarn](https://yarnpkg.com/)

## Building

```bash
anchor build
```

## Testing

```bash
anchor test
```

## Instructions

### `make`

Opens an escrow. The maker deposits `amount` of token A into a vault.

| Argument  | Type | Description                                          |
|-----------|------|------------------------------------------------------|
| `seed`    | u64  | Arbitrary value used as a PDA seed; allows a maker to run multiple escrows simultaneously |
| `amount`  | u64  | Amount of token A to deposit into the vault          |

The `amount` must be greater than zero.

### `take`

Completes the move:

1. Transfers the full vault balance of token A from the vault to the taker
2. Closes the vault account (rent → maker)
3. Closes the escrow account (rent → maker)

### `refund`

Cancels the escrow. Only the original maker can call this:

1. Transfers the full vault balance of token A back to the maker
2. Closes the vault account (rent → maker)
3. Closes the escrow account (rent → maker)

## Accounts

### `Escrow` — PDA seeds: `["escrow", maker_pubkey, seed (little-endian u64)]`

| Field     | Type   | Description                                   |
|-----------|--------|-----------------------------------------------|
| `seed`    | u64    | PDA seed chosen by the maker                  |
| `maker`   | Pubkey | The wallet that created the escrow            |
| `mint`  | Pubkey | The token the maker is offering               |
| `bump`    | u8     | PDA bump seed                                 |

### Vault

An associated token account owned by the `Escrow` PDA, holding the deposited token A. Closed when the swap completes or is refunded.

## Token Interface

The program uses `TokenInterface` / `InterfaceAccount<Mint>` / `InterfaceAccount<TokenAccount>` rather than the concrete SPL Token types. This means the same program handles both **legacy SPL Token** and **Token-2022** mints without any changes.

## Error Codes

| Code           | Message          |
|----------------|------------------|
| `InvalidAmount` | Invalid amount  |
| `InvalidMaker`  | Invalid maker   |
| `InvalidMint`  | Invalid mint |
