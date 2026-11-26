cd /opt/misc/solcrow
NO_DNA=1 anchor build
NO_DNA=1 solana-verify build
NO_DNA=1 solana program deploy target/deploy/anchor_escrow.so \
  --program-id target/deploy/anchor_escrow-keypair.json \
  --upgrade-authority "$HOME/.config/solana/id.json" \
  --fee-payer "$HOME/.config/solana/id.json" \
  --url https://api.devnet.solana.com
NO_DNA=1 solana program show kWEt7FsG2q3uhWYKadycaobTVK4AtqBkxQxiTRvBzUF \
  --url https://api.devnet.solana.com