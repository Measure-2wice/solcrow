fn main() {
    println!("cargo:rerun-if-changed=target/deploy/anchor_escrow.so");
    println!("cargo:rerun-if-changed=idls/anchor_escrow.json");
}
