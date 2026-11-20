//! Print the escrow bytecode (admin = the operator) as JSON for the TS side,
//! or with `vectors`, golden calldata vectors the TS encoders are tested
//! against (`abi-vectors.json`).
use living_pets_escrow::*;

fn main() {
    if std::env::args().nth(1).as_deref() == Some("vectors") {
        print!("{}", abi_vectors_json());
        return;
    }
    let admin = account_from_hex(OPERATOR_HEX);
    let code = escrow_bytecode(&admin);
    println!(
        "{{\n  \"admin\": \"{}\",\n  \"bytes\": {},\n  \"bytecode\": \"0x{}\"\n}}",
        OPERATOR_HEX,
        code.len(),
        hex::encode(&code)
    );
}
