//! Print the escrow bytecode (admin = the operator) as JSON for the TS side,
//! or with `vectors`, golden calldata vectors the TS encoders are tested
//! against (`abi-vectors.json`). `item` and `item-vectors` do the same for
//! the item escrow (`item-escrow.bytecode.json`, `item-abi-vectors.json`).
use living_pets_escrow::*;

fn main() {
    let arg = std::env::args().nth(1);
    let admin = account_from_hex(OPERATOR_HEX);
    let code = match arg.as_deref() {
        Some("vectors") => {
            print!("{}", abi_vectors_json());
            return;
        }
        Some("item-vectors") => {
            print!("{}", item_abi_vectors_json());
            return;
        }
        Some("item") => item_escrow_bytecode(&admin),
        _ => escrow_bytecode(&admin),
    };
    println!(
        "{{\n  \"admin\": \"{}\",\n  \"bytes\": {},\n  \"bytecode\": \"0x{}\"\n}}",
        OPERATOR_HEX,
        code.len(),
        hex::encode(&code)
    );
}
