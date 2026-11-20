//! Print the escrow bytecode (admin = the operator) as JSON for the TS side.
use living_pets_escrow::{account_from_hex, escrow_bytecode, OPERATOR_HEX};

fn main() {
    let admin = account_from_hex(OPERATOR_HEX);
    let code = escrow_bytecode(&admin);
    println!(
        "{{\n  \"admin\": \"{}\",\n  \"bytes\": {},\n  \"bytecode\": \"0x{}\"\n}}",
        OPERATOR_HEX,
        code.len(),
        hex::encode(&code)
    );
}
