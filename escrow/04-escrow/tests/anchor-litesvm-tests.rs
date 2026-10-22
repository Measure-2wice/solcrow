#![allow(unexpected_cfgs)]

use anchor_litesvm::{AnchorLiteSVM, Signer};
use litesvm_utils::{AssertionHelpers, TestHelpers};
use anchor_lang::{self, system_program};
use spl_associated_token_account::get_associated_token_address;
use spl_token;

// Generate client modules from the program using declare_program!
anchor_lang::declare_program!(anchor_escrow);

#[test]
fn test_escrow_make_and_take() {
    // ============================================================================
    // 1. Initialize AnchorLiteSVM with the escrow program
    // ============================================================================
    let program_id = anchor_escrow::ID;

    let mut ctx = AnchorLiteSVM::build_with_program(
        program_id,
        include_bytes!("../target/deploy/anchor_escrow.so"),
    );

    // ============================================================================
    // 2. Create test accounts
    // ============================================================================
    let maker = ctx.svm.create_funded_account(10_000_000_000).unwrap(); // 10 SOL
    let taker = ctx.svm.create_funded_account(10_000_000_000).unwrap(); // 10 SOL

    // ============================================================================
    // 3. Create token mints and funded token accounts
    // ============================================================================
    let mint = ctx.svm.create_token_mint(&maker, 9).unwrap();

    // Maker's account for mint_a (will deposit into escrow)
    let maker_ata = ctx.svm
        .create_associated_token_account(&mint.pubkey(), &maker)
        .unwrap();
    ctx.svm
        .mint_to(&mint.pubkey(), &maker_ata, &maker, 1_000_000_000)
        .unwrap(); // 1.0 tokens

    // ============================================================================
    // 4. Build and execute "Make" instruction
    // ============================================================================
    let seed: u64 = 42;
    let escrow_pda = ctx.svm.get_pda(
        &[b"escrow", maker.pubkey().as_ref(), &seed.to_le_bytes()],
        &program_id,
    );
    let vault = get_associated_token_address(&escrow_pda, &mint.pubkey());

    let make_ix = ctx.program()
        .accounts(anchor_escrow::client::accounts::Make {
            maker: maker.pubkey(),
            escrow: escrow_pda,
            mint: mint.pubkey(),
            maker_ata,
            vault,
            associated_token_program: spl_associated_token_account::id(),
            token_program: spl_token::id(),
            system_program: system_program::ID,
        })
        .args(anchor_escrow::client::args::Make {
            seed,
            amount: 1_000_000_000, // 1.0 tokens
        })
        .instruction()
        .unwrap();

    ctx.execute_instruction(make_ix, &[&maker])
        .unwrap()
        .assert_success();

    // Verify escrow was created and tokens were transferred
    assert!(ctx.account_exists(&escrow_pda), "Escrow account should exist");
    ctx.svm.assert_token_balance(&vault, 1_000_000_000);
    ctx.svm.assert_token_balance(&maker_ata, 0);

    // ============================================================================
    // 5. Build and execute "Take" instruction
    // ============================================================================
    let taker_ata = get_associated_token_address(&taker.pubkey(), &mint.pubkey());

    let take_ix = ctx.program()
        .accounts(anchor_escrow::client::accounts::Take {
            taker: taker.pubkey(),
            maker: maker.pubkey(),
            escrow: escrow_pda,
            mint: mint.pubkey(),
            vault,
            taker_ata,
            associated_token_program: spl_associated_token_account::id(),
            token_program: spl_token::id(),
            system_program: system_program::ID,
        })
        .args(anchor_escrow::client::args::Take {})
        .instruction()
        .unwrap();

    ctx.execute_instruction(take_ix, &[&taker])
        .unwrap()
        .assert_success();

    // ============================================================================
    // 6. Verify final state
    // ============================================================================

    // Verify accounts were closed
    ctx.svm.assert_account_closed(&escrow_pda);
    ctx.svm.assert_account_closed(&vault);

    // Verify token balances after the swap
    ctx.svm.assert_token_balance(&taker_ata, 1_000_000_000); // Taker received mint_a tokens
}
