fn main() {
    println!("cargo:rerun-if-changed=target/deploy/anchor_escrow.so");
}
