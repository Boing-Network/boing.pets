//! Living Pets **item escrow**: fungible listings of reference multi-token
//! (LPIT) balances, settled in native BOING. A separate contract from the NFT
//! escrow in `lib.rs` (same assembler, same fee rules), because a listing here
//! is a quantity with a per-unit price, not one token.
//!
//! - `prepare` (0x60) + `list` (0x61): one atomic batch of
//!   `[escrow.prepare(collection, item), collection.transfer(escrow, item, qty),
//!   escrow.list(collection, item, qty, unit_price)]`. `prepare` records the
//!   caller as pending seller and snapshots the escrow's own `balance_of(item)`;
//!   `list` requires the same caller and item and that the escrow's balance
//!   grew by **exactly** `qty`. Units sent to the escrow any other way can never
//!   be listed by anyone (only `rescue` returns them).
//! - `buy` (0x62): `ContractCallWithValue(buy(id, qty))` with exactly
//!   `qty * unit_price`. Partial fills are allowed; the listing closes when its
//!   last unit sells. The fee (`total * fee_bps / 10_000`, floored) goes to the
//!   fee account, the rest to the seller. Each fill is recorded on chain
//!   (`fill(id, k)` → buyer, qty) so the game server can credit the buyer's
//!   in-game inventory from contract state alone.
//! - `cancel` (0x63): seller or admin; the unsold units go back to the seller.
//!   After a cancel, `remaining` keeps the number of units that were returned.
//! - `listing` (0x64): `(seller, collection, item, unit_price, listed,
//!   remaining, open, fills)`. `fill` (0x65): `(buyer, qty)`.
//! - `set_fee` (0x66), `rescue` (0x67, only units not held for a listing),
//!   `set_collection` (0x68), `config` (0x69: admin, fee bps, fee account,
//!   next listing id), `set_admin` (0x6a), `held` (0x6b: allowed, units held
//!   for open listings).
//!
//! Every failed check faults (jump out of range) and reverts the whole
//! transaction including attached value. Listing state is updated before any
//! outgoing call, `NATIVE_TRANSFER` never runs recipient code, and nested calls
//! carry no value. The reference multi-token `transfer` faults on an
//! insufficient balance (unlike the reference NFT), and every transfer out is
//! still followed by a `balance_of` check on the escrow's own balance.

use super::{selector_word, tag, word_u128, Asm, BPS_DENOMINATOR, DEFAULT_FEE_BPS, MAX_FEE_BPS};
use boing_execution::Opcode as O;
use boing_primitives::AccountId;

pub const SEL_I_PREPARE: u8 = 0x60;
pub const SEL_I_LIST: u8 = 0x61;
pub const SEL_I_BUY: u8 = 0x62;
pub const SEL_I_CANCEL: u8 = 0x63;
pub const SEL_I_LISTING: u8 = 0x64;
pub const SEL_I_FILL: u8 = 0x65;
pub const SEL_I_SET_FEE: u8 = 0x66;
pub const SEL_I_RESCUE: u8 = 0x67;
pub const SEL_I_SET_COLLECTION: u8 = 0x68;
pub const SEL_I_CONFIG: u8 = 0x69;
pub const SEL_I_SET_ADMIN: u8 = 0x6a;
pub const SEL_I_HELD: u8 = 0x6b;

/// Reference multi-token selectors the item escrow calls.
const MT_BALANCE_OF: u8 = 0x20;
const MT_TRANSFER: u8 = 0x21;

pub const KI_ADMIN: [u8; 32] = tag(b"LPIE_ADMIN");
pub const KI_FEE_BPS: [u8; 32] = tag(b"LPIE_FEEBPS");
pub const KI_FEE_TO: [u8; 32] = tag(b"LPIE_FEETO");
pub const KI_NEXT_ID: [u8; 32] = tag(b"LPIE_NEXTID");
pub const KI_NEXT_INDEX: [u8; 32] = tag(b"LPIE_NEXTIDX");
pub const KI_P_SELLER: [u8; 32] = tag(b"LPIE_P_SELLER");
pub const KI_P_COLL: [u8; 32] = tag(b"LPIE_P_COLL");
pub const KI_P_ITEM: [u8; 32] = tag(b"LPIE_P_ITEM");
pub const KI_P_BASE: [u8; 32] = tag(b"LPIE_P_BASE");
/// `collection ^ TI_COLL_INDEX` = collection index (1, 2, ...), never reused.
pub const TI_COLL_INDEX: [u8; 32] = tag(b"LPIE_CIDX");
/// `collection ^ TI_COLL_OK` = 1 when `list` accepts the collection.
pub const TI_COLL_OK: [u8; 32] = tag(b"LPIE_COK");
/// Units held for open listings: `tag + index * 2^64 + item`.
pub const TI_HELD: [u8; 32] = tag(b"LPIE_HELD");
/// Listing fields: `tag + id` (id < 2^64).
pub const TI_SELLER: [u8; 32] = tag(b"LPIE_SELLER");
pub const TI_COLL: [u8; 32] = tag(b"LPIE_COLL");
pub const TI_ITEM: [u8; 32] = tag(b"LPIE_ITEM");
pub const TI_PRICE: [u8; 32] = tag(b"LPIE_PRICE");
pub const TI_LISTED: [u8; 32] = tag(b"LPIE_LISTED");
pub const TI_REMAINING: [u8; 32] = tag(b"LPIE_REMAIN");
pub const TI_OPEN: [u8; 32] = tag(b"LPIE_OPEN");
pub const TI_FILLS: [u8; 32] = tag(b"LPIE_FILLS");
/// Fill records: `tag + id * 2^64 + k`.
pub const TI_FILL_BUYER: [u8; 32] = tag(b"LPIE_F_BUYER");
pub const TI_FILL_QTY: [u8; 32] = tag(b"LPIE_F_QTY");
/// Log topic0 values: LOG3(topic, id, item) with the 8-word listing as data.
pub const LOGI_LIST: [u8; 32] = tag(b"LPIE_LIST");
pub const LOGI_BUY: [u8; 32] = tag(b"LPIE_BUY");
pub const LOGI_CANCEL: [u8; 32] = tag(b"LPIE_CANCEL");

// Scratch memory (calldata occupies 0..160).
const M_SEL: u64 = 256;
const M_COLL: u64 = 288;
const M_ITEM: u64 = 320;
const M_IDX: u64 = 352;
const M_ID: u64 = 384;
const M_QTY: u64 = 416;
const M_ADMIN: u64 = 448; // admin, fee bps, fee to, next id (config return)
const M_FEE_BPS: u64 = 480;
const M_FEE_TO: u64 = 512;
const M_NEXT: u64 = 544;
const M_FEE: u64 = 576;
const M_TO: u64 = 608;
const M_BAL: u64 = 640;
const M_TOTAL: u64 = 672;
// Listing block (listing return, log data): 8 contiguous words.
const M_L: u64 = 704;
const M_L_SELLER: u64 = M_L;
const M_L_COLL: u64 = M_L + 32;
const M_L_ITEM: u64 = M_L + 64;
const M_L_PRICE: u64 = M_L + 96;
const M_L_LISTED: u64 = M_L + 128;
const M_L_REM: u64 = M_L + 160;
const M_L_OPEN: u64 = M_L + 192;
const M_L_FILLS: u64 = M_L + 224;
const M_ARGS: u64 = 960; // 4 words
const M_RET: u64 = 1088;
const M_OUT: u64 = 1120; // 2 words

const LISTING_FIELDS: [([u8; 32], u64); 8] = [
    (TI_SELLER, M_L_SELLER),
    (TI_COLL, M_L_COLL),
    (TI_ITEM, M_L_ITEM),
    (TI_PRICE, M_L_PRICE),
    (TI_LISTED, M_L_LISTED),
    (TI_REMAINING, M_L_REM),
    (TI_OPEN, M_L_OPEN),
    (TI_FILLS, M_L_FILLS),
];

fn add_low(tagw: [u8; 32], hi: u64, lo: u64) -> [u8; 32] {
    let mut w = tagw;
    w[16..24].copy_from_slice(&hi.to_be_bytes());
    w[24..32].copy_from_slice(&lo.to_be_bytes());
    w
}

/// Storage key of a listing field (mirrors the bytecode; tests and indexers).
pub fn item_listing_key(field_tag: [u8; 32], id: u64) -> [u8; 32] {
    add_low(field_tag, 0, id)
}
/// Storage key of fill `k` of listing `id`.
pub fn item_fill_key(field_tag: [u8; 32], id: u64, k: u64) -> [u8; 32] {
    add_low(field_tag, id, k)
}
/// Storage key of the units held for open listings of `item`.
pub fn item_held_key(collection_index: u64, item: u64) -> [u8; 32] {
    add_low(TI_HELD, collection_index, item)
}

impl Asm {
    fn i_require_u64(&mut self, off: u64) {
        self.mload(off);
        self.push_u(1u128 << 64);
        self.op(O::Lt);
        self.require();
    }
    /// Push `tag + mem[M_ID]`.
    fn i_lkey(&mut self, field: [u8; 32]) {
        self.push(field);
        self.mload(M_ID);
        self.op(O::Add);
    }
    /// Push `tag + mem[M_ID] * 2^64 + mem[k_off]`.
    fn i_fkey(&mut self, field: [u8; 32], k_off: u64) {
        self.push(field);
        self.mload(M_ID);
        self.push_u(1u128 << 64);
        self.op(O::Mul);
        self.op(O::Add);
        self.mload(k_off);
        self.op(O::Add);
    }
    fn i_coll_key(&mut self, t: [u8; 32]) {
        self.mload(M_COLL);
        self.push(t);
        self.op(O::Xor);
    }
    /// Push the held key for (M_COLL's index in M_IDX, M_ITEM).
    fn i_hkey(&mut self) {
        self.push(TI_HELD);
        self.mload(M_IDX);
        self.push_u(1u128 << 64);
        self.op(O::Mul);
        self.op(O::Add);
        self.mload(M_ITEM);
        self.op(O::Add);
    }
    fn i_load_index(&mut self) {
        self.i_coll_key(TI_COLL_INDEX);
        self.op(O::SLoad);
        self.mstore(M_IDX);
    }
    /// Listing id from calldata word 1 (< 2^64), then load its fields.
    fn i_load_listing(&mut self) {
        self.mload(32);
        self.mstore(M_ID);
        self.i_require_u64(M_ID);
        for (t, m) in LISTING_FIELDS {
            self.i_lkey(t);
            self.op(O::SLoad);
            self.mstore(m);
        }
    }
    fn i_store_field(&mut self, t: [u8; 32], m: u64) {
        self.mload(m);
        self.i_lkey(t);
        self.op(O::SStore);
    }
    fn i_require_admin(&mut self) {
        self.op(O::Caller);
        self.mload(M_ADMIN);
        self.op(O::Eq);
        self.require();
    }
    /// Nested call into the collection (M_COLL) with selector + `words`.
    fn i_mt_call(&mut self, sel: u8, words: &[&dyn Fn(&mut Asm)], ret: u64) {
        self.push(selector_word(sel));
        self.mstore(M_ARGS);
        for (i, w) in words.iter().enumerate() {
            w(self);
            self.mstore(M_ARGS + 32 * (i as u64 + 1));
        }
        self.mload(M_COLL);
        self.push_u(M_ARGS as u128);
        self.push_u(32 * (words.len() as u128 + 1));
        self.push_u(M_RET as u128);
        self.push_u(ret as u128);
        self.op(O::Call);
        self.require();
    }
    /// `mem[M_BAL] = balance_of(escrow, M_ITEM)`.
    fn i_self_balance(&mut self) {
        self.push_u(0);
        self.mstore(M_RET);
        self.i_mt_call(
            MT_BALANCE_OF,
            &[&|a: &mut Asm| a.op(O::Address), &|a: &mut Asm| {
                a.mload(M_ITEM)
            }],
            32,
        );
        self.mload(M_RET);
        self.mstore(M_BAL);
    }
    /// Send `mem[M_QTY]` units of M_ITEM to `mem[to_mem]`, then check the
    /// escrow's balance dropped by exactly that much.
    fn i_send(&mut self, to_mem: u64) {
        self.i_self_balance();
        self.mload(M_BAL);
        self.mload(M_QTY);
        self.op(O::Sub);
        self.mstore(M_TOTAL); // expected balance after
        self.i_mt_call(
            MT_TRANSFER,
            &[
                &|a: &mut Asm| a.mload(to_mem),
                &|a: &mut Asm| a.mload(M_ITEM),
                &|a: &mut Asm| a.mload(M_QTY),
            ],
            0,
        );
        self.i_self_balance();
        self.mload(M_BAL);
        self.mload(M_TOTAL);
        self.op(O::Eq);
        self.require();
    }
    /// held[M_IDX][M_ITEM] += mem[M_QTY] (or -= with `sub`).
    fn i_held_add(&mut self, sub: bool) {
        self.i_hkey();
        self.op(O::SLoad);
        self.mload(M_QTY);
        self.op(if sub { O::Sub } else { O::Add });
        self.i_hkey();
        self.op(O::SStore);
    }
    fn i_log(&mut self, topic0: [u8; 32]) {
        self.push(topic0);
        self.mload(M_ID);
        self.mload(M_L_ITEM);
        self.push_u(256);
        self.push_u(M_L as u128);
        self.op(O::Log3);
    }
}

/// Item escrow runtime bytecode. `admin` is baked in and receives the default
/// 2.5% fee until `set_fee` runs.
pub fn item_escrow_bytecode(admin: &AccountId) -> Vec<u8> {
    let mut a = Asm::new();
    a.compact = true;

    a.mload(0);
    a.push_u(0xff);
    a.op(O::And);
    a.mstore(M_SEL);

    // Only `buy` accepts value.
    a.mload(M_SEL);
    a.push_u(SEL_I_BUY as u128);
    a.op(O::Eq);
    a.jumpi("value_ok");
    a.op(O::CallValue);
    a.op(O::IsZero);
    a.require();
    a.label("value_ok");

    a.push(KI_ADMIN);
    a.op(O::SLoad);
    a.mstore(M_ADMIN);
    a.mload(M_ADMIN);
    a.jumpi("admin_ok");
    a.push(admin.0);
    a.mstore(M_ADMIN);
    a.label("admin_ok");

    a.push(KI_FEE_TO);
    a.op(O::SLoad);
    a.mstore(M_FEE_TO);
    a.mload(M_FEE_TO);
    a.op(O::IsZero);
    a.jumpi("fee_default");
    a.push(KI_FEE_BPS);
    a.op(O::SLoad);
    a.mstore(M_FEE_BPS);
    a.jump("fee_ok");
    a.label("fee_default");
    a.push_u(DEFAULT_FEE_BPS);
    a.mstore(M_FEE_BPS);
    a.mload(M_ADMIN);
    a.mstore(M_FEE_TO);
    a.label("fee_ok");

    a.push(KI_NEXT_ID);
    a.op(O::SLoad);
    a.mstore(M_NEXT);

    for (sel, l) in [
        (SEL_I_PREPARE, "prepare"),
        (SEL_I_LIST, "list"),
        (SEL_I_BUY, "buy"),
        (SEL_I_CANCEL, "cancel"),
        (SEL_I_LISTING, "listing"),
        (SEL_I_FILL, "fill"),
        (SEL_I_SET_FEE, "set_fee"),
        (SEL_I_RESCUE, "rescue"),
        (SEL_I_SET_COLLECTION, "set_collection"),
        (SEL_I_CONFIG, "config"),
        (SEL_I_SET_ADMIN, "set_admin"),
        (SEL_I_HELD, "held"),
    ] {
        a.mload(M_SEL);
        a.push_u(sel as u128);
        a.op(O::Eq);
        a.jumpi(l);
    }
    a.jump("fault");

    // -- prepare(collection, item) --------------------------------------------
    a.label("prepare");
    a.mload(32);
    a.mstore(M_COLL);
    a.mload(64);
    a.mstore(M_ITEM);
    a.i_require_u64(M_ITEM);
    a.i_coll_key(TI_COLL_OK);
    a.op(O::SLoad);
    a.require();
    a.i_self_balance();
    a.op(O::Caller);
    a.push(KI_P_SELLER);
    a.op(O::SStore);
    a.mload(M_COLL);
    a.push(KI_P_COLL);
    a.op(O::SStore);
    a.mload(M_ITEM);
    a.push(KI_P_ITEM);
    a.op(O::SStore);
    a.mload(M_BAL);
    a.push(KI_P_BASE);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- list(collection, item, qty, unit_price) -------------------------------
    a.label("list");
    a.mload(32);
    a.mstore(M_COLL);
    a.mload(64);
    a.mstore(M_ITEM);
    a.mload(96);
    a.mstore(M_QTY);
    a.i_require_u64(M_ITEM);
    a.i_require_u64(M_QTY);
    a.mload(M_QTY);
    a.require();
    // unit price: 0 < price < 2^128 (qty * price stays far below 2^256).
    a.mload(128);
    a.require();
    a.mload(128);
    a.push_u(u128::MAX);
    a.push_u(1);
    a.op(O::Add);
    a.op(O::Lt);
    a.require();
    a.i_coll_key(TI_COLL_OK);
    a.op(O::SLoad);
    a.require();
    // Same caller, collection and item as `prepare`.
    a.push(KI_P_SELLER);
    a.op(O::SLoad);
    a.op(O::Caller);
    a.op(O::Eq);
    a.require();
    a.push(KI_P_COLL);
    a.op(O::SLoad);
    a.mload(M_COLL);
    a.op(O::Eq);
    a.require();
    a.push(KI_P_ITEM);
    a.op(O::SLoad);
    a.mload(M_ITEM);
    a.op(O::Eq);
    a.require();
    // The escrow's balance grew by exactly qty since `prepare`.
    a.i_self_balance();
    a.push(KI_P_BASE);
    a.op(O::SLoad);
    a.mload(M_QTY);
    a.op(O::Add);
    a.mload(M_BAL);
    a.op(O::Eq);
    a.require();
    for k in [KI_P_SELLER, KI_P_COLL, KI_P_ITEM, KI_P_BASE] {
        a.push_u(0);
        a.push(k);
        a.op(O::SStore);
    }
    // id = next_id + 1
    a.mload(M_NEXT);
    a.push_u(1);
    a.op(O::Add);
    a.mstore(M_ID);
    a.mload(M_ID);
    a.push(KI_NEXT_ID);
    a.op(O::SStore);
    a.op(O::Caller);
    a.mstore(M_L_SELLER);
    a.mload(M_COLL);
    a.mstore(M_L_COLL);
    a.mload(M_ITEM);
    a.mstore(M_L_ITEM);
    a.mload(128);
    a.mstore(M_L_PRICE);
    a.mload(M_QTY);
    a.mstore(M_L_LISTED);
    a.mload(M_QTY);
    a.mstore(M_L_REM);
    a.push_u(1);
    a.mstore(M_L_OPEN);
    a.push_u(0);
    a.mstore(M_L_FILLS);
    for (t, m) in LISTING_FIELDS {
        a.i_store_field(t, m);
    }
    a.i_load_index();
    a.i_held_add(false);
    a.i_log(LOGI_LIST);
    a.op(O::Stop);

    // -- buy(id, qty) -------------------------------------------------------------
    a.label("buy");
    a.i_load_listing();
    a.mload(M_L_OPEN);
    a.require();
    a.mload(64);
    a.mstore(M_QTY);
    a.mload(M_QTY);
    a.require();
    // qty <= remaining  <=>  !(remaining < qty)
    a.mload(M_L_REM);
    a.mload(M_QTY);
    a.op(O::Lt);
    a.op(O::IsZero);
    a.require();
    // value == qty * unit_price
    a.mload(M_QTY);
    a.mload(M_L_PRICE);
    a.op(O::Mul);
    a.mstore(M_TOTAL);
    a.op(O::CallValue);
    a.mload(M_TOTAL);
    a.op(O::Eq);
    a.require();
    // Effects: remaining, open, fill record, held.
    a.mload(M_L_REM);
    a.mload(M_QTY);
    a.op(O::Sub);
    a.mstore(M_L_REM);
    a.mload(M_L_REM);
    a.op(O::IsZero);
    a.op(O::IsZero);
    a.mstore(M_L_OPEN);
    a.op(O::Caller);
    a.i_fkey(TI_FILL_BUYER, M_L_FILLS);
    a.op(O::SStore);
    a.mload(M_QTY);
    a.i_fkey(TI_FILL_QTY, M_L_FILLS);
    a.op(O::SStore);
    a.mload(M_L_FILLS);
    a.push_u(1);
    a.op(O::Add);
    a.mstore(M_L_FILLS);
    a.i_store_field(TI_REMAINING, M_L_REM);
    a.i_store_field(TI_OPEN, M_L_OPEN);
    a.i_store_field(TI_FILLS, M_L_FILLS);
    a.mload(M_L_COLL);
    a.mstore(M_COLL);
    a.mload(M_L_ITEM);
    a.mstore(M_ITEM);
    a.i_load_index();
    a.i_held_add(true);
    // Interactions: units to the buyer, then the payment split. The total is
    // recomputed after the nested calls (they reuse scratch memory).
    a.op(O::Caller);
    a.mstore(M_TO);
    a.i_send(M_TO);
    a.mload(M_QTY);
    a.mload(M_L_PRICE);
    a.op(O::Mul);
    a.mstore(M_TOTAL);
    let no_fee = a.fresh("no_fee");
    a.mload(M_TOTAL);
    a.mload(M_FEE_BPS);
    a.op(O::Mul);
    a.push_u(BPS_DENOMINATOR);
    a.op(O::Div);
    a.mstore(M_FEE);
    a.mload(M_FEE);
    a.op(O::IsZero);
    a.jumpi(&no_fee);
    a.mload(M_FEE);
    a.mload(M_FEE_TO);
    a.op(O::NativeTransfer);
    a.label(&no_fee);
    a.mload(M_TOTAL);
    a.mload(M_FEE);
    a.op(O::Sub);
    a.mload(M_L_SELLER);
    a.op(O::NativeTransfer);
    a.i_log(LOGI_BUY);
    a.op(O::Stop);

    // -- cancel(id) ------------------------------------------------------------------
    a.label("cancel");
    a.i_load_listing();
    a.mload(M_L_OPEN);
    a.require();
    a.op(O::Caller);
    a.mload(M_L_SELLER);
    a.op(O::Eq);
    a.op(O::Caller);
    a.mload(M_ADMIN);
    a.op(O::Eq);
    a.op(O::Or);
    a.require();
    a.push_u(0);
    a.mstore(M_L_OPEN);
    a.i_store_field(TI_OPEN, M_L_OPEN);
    a.mload(M_L_REM);
    a.mstore(M_QTY);
    a.mload(M_L_COLL);
    a.mstore(M_COLL);
    a.mload(M_L_ITEM);
    a.mstore(M_ITEM);
    a.i_load_index();
    a.i_held_add(true);
    a.i_send(M_L_SELLER);
    a.i_log(LOGI_CANCEL);
    a.op(O::Stop);

    // -- listing(id) -> 8 words -------------------------------------------------------
    a.label("listing");
    a.i_load_listing();
    a.push_u(256);
    a.push_u(M_L as u128);
    a.op(O::Return);

    // -- fill(id, k) -> (buyer, qty) ---------------------------------------------------
    a.label("fill");
    a.mload(32);
    a.mstore(M_ID);
    a.i_require_u64(M_ID);
    a.i_require_u64(64);
    a.i_fkey(TI_FILL_BUYER, 64);
    a.op(O::SLoad);
    a.mstore(M_OUT);
    a.i_fkey(TI_FILL_QTY, 64);
    a.op(O::SLoad);
    a.mstore(M_OUT + 32);
    a.push_u(64);
    a.push_u(M_OUT as u128);
    a.op(O::Return);

    // -- set_fee(bps, fee_to) -------------------------------------------------------------
    a.label("set_fee");
    a.i_require_admin();
    a.mload(32);
    a.push_u(MAX_FEE_BPS + 1);
    a.op(O::Lt);
    a.require();
    a.mload(64);
    a.require();
    a.mload(32);
    a.push(KI_FEE_BPS);
    a.op(O::SStore);
    a.mload(64);
    a.push(KI_FEE_TO);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- rescue(collection, item, qty, to): only units no listing holds ------------------
    a.label("rescue");
    a.i_require_admin();
    a.mload(32);
    a.mstore(M_COLL);
    a.mload(64);
    a.mstore(M_ITEM);
    a.mload(96);
    a.mstore(M_QTY);
    a.mload(128);
    a.mstore(M_TO);
    a.i_require_u64(M_ITEM);
    a.mload(M_QTY);
    a.require();
    a.mload(M_TO);
    a.require();
    a.i_load_index();
    a.i_self_balance();
    // held + qty <= balance  <=>  !(balance < held + qty)
    a.mload(M_BAL);
    a.i_hkey();
    a.op(O::SLoad);
    a.mload(M_QTY);
    a.op(O::Add);
    a.op(O::Lt);
    a.op(O::IsZero);
    a.require();
    a.i_send(M_TO);
    a.op(O::Stop);

    // -- set_collection(collection, allowed) -------------------------------------------
    a.label("set_collection");
    a.i_require_admin();
    a.mload(32);
    a.mstore(M_COLL);
    a.mload(M_COLL);
    a.require();
    a.i_coll_key(TI_COLL_INDEX);
    a.op(O::SLoad);
    a.jumpi("has_index");
    a.push(KI_NEXT_INDEX);
    a.op(O::SLoad);
    a.push_u(1);
    a.op(O::Add);
    a.mstore(M_IDX);
    a.mload(M_IDX);
    a.push(KI_NEXT_INDEX);
    a.op(O::SStore);
    a.mload(M_IDX);
    a.i_coll_key(TI_COLL_INDEX);
    a.op(O::SStore);
    a.label("has_index");
    a.mload(64);
    a.op(O::IsZero);
    a.op(O::IsZero);
    a.i_coll_key(TI_COLL_OK);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- config() -> (admin, fee_bps, fee_to, next_id) ---------------------------------
    a.label("config");
    a.push_u(128);
    a.push_u(M_ADMIN as u128);
    a.op(O::Return);

    // -- set_admin(new_admin) ---------------------------------------------------------------
    a.label("set_admin");
    a.i_require_admin();
    a.mload(32);
    a.require();
    a.mload(32);
    a.push(KI_ADMIN);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- held(collection, item) -> (allowed, units held for open listings) -------------
    a.label("held");
    a.mload(32);
    a.mstore(M_COLL);
    a.mload(64);
    a.mstore(M_ITEM);
    a.i_require_u64(M_ITEM);
    a.i_coll_key(TI_COLL_OK);
    a.op(O::SLoad);
    a.mstore(M_OUT);
    a.i_load_index();
    a.i_hkey();
    a.op(O::SLoad);
    a.mstore(M_OUT + 32);
    a.push_u(64);
    a.push_u(M_OUT as u128);
    a.op(O::Return);

    a.label("fault");
    a.push_u(u64::MAX as u128);
    a.op(O::Jump);

    a.finish()
}

// -- calldata encoders (mirrored in packages/contract/src/item-escrow.ts) ------------

fn words(sel: u8, args: &[[u8; 32]]) -> Vec<u8> {
    let mut v = selector_word(sel).to_vec();
    for w in args {
        v.extend_from_slice(w);
    }
    v
}
fn u(n: u64) -> [u8; 32] {
    word_u128(n as u128)
}

pub fn encode_item_prepare(collection: &AccountId, item: u64) -> Vec<u8> {
    words(SEL_I_PREPARE, &[collection.0, u(item)])
}
pub fn encode_item_list(collection: &AccountId, item: u64, qty: u64, unit_price: u128) -> Vec<u8> {
    words(
        SEL_I_LIST,
        &[collection.0, u(item), u(qty), word_u128(unit_price)],
    )
}
pub fn encode_item_buy(id: u64, qty: u64) -> Vec<u8> {
    words(SEL_I_BUY, &[u(id), u(qty)])
}
pub fn encode_item_cancel(id: u64) -> Vec<u8> {
    words(SEL_I_CANCEL, &[u(id)])
}
pub fn encode_item_listing(id: u64) -> Vec<u8> {
    words(SEL_I_LISTING, &[u(id)])
}
pub fn encode_item_fill(id: u64, k: u64) -> Vec<u8> {
    words(SEL_I_FILL, &[u(id), u(k)])
}
pub fn encode_item_set_fee(bps: u128, fee_to: &AccountId) -> Vec<u8> {
    words(SEL_I_SET_FEE, &[word_u128(bps), fee_to.0])
}
pub fn encode_item_rescue(collection: &AccountId, item: u64, qty: u64, to: &AccountId) -> Vec<u8> {
    words(SEL_I_RESCUE, &[collection.0, u(item), u(qty), to.0])
}
pub fn encode_item_set_collection(collection: &AccountId, allowed: bool) -> Vec<u8> {
    words(
        SEL_I_SET_COLLECTION,
        &[collection.0, word_u128(allowed as u128)],
    )
}
pub fn encode_item_config() -> Vec<u8> {
    words(SEL_I_CONFIG, &[])
}
pub fn encode_item_set_admin(admin: &AccountId) -> Vec<u8> {
    words(SEL_I_SET_ADMIN, &[admin.0])
}
pub fn encode_item_held(collection: &AccountId, item: u64) -> Vec<u8> {
    words(SEL_I_HELD, &[collection.0, u(item)])
}

/// Golden calldata vectors for the TS encoders (`item-abi-vectors.json`):
/// collection `0xc0...`, escrow `0xe5...`, buyer `0xb0...`, item 2, 3 units
/// at 0.25 BOING each.
pub fn item_abi_vectors_json() -> String {
    let coll = AccountId([0xc0; 32]);
    let escrow = AccountId([0xe5; 32]);
    let buyer = AccountId([0xb0; 32]);
    let unit: u128 = 250_000_000_000_000_000;
    let total = unit * 3;
    let (fee, seller) = super::split_price(total, DEFAULT_FEE_BPS);
    let rows: Vec<(&str, String)> = vec![
        ("collection", format!("0x{}", hex::encode(coll.0))),
        ("escrow", format!("0x{}", hex::encode(escrow.0))),
        ("buyer", format!("0x{}", hex::encode(buyer.0))),
        ("item", "2".into()),
        ("qty", "3".into()),
        ("unit_price", unit.to_string()),
        ("total", total.to_string()),
        ("fee", fee.to_string()),
        ("seller_amount", seller.to_string()),
        ("prepare", hex::encode(encode_item_prepare(&coll, 2))),
        ("list", hex::encode(encode_item_list(&coll, 2, 3, unit))),
        ("buy", hex::encode(encode_item_buy(7, 3))),
        ("cancel", hex::encode(encode_item_cancel(7))),
        ("listing", hex::encode(encode_item_listing(7))),
        ("fill", hex::encode(encode_item_fill(7, 1))),
        (
            "set_fee",
            hex::encode(encode_item_set_fee(DEFAULT_FEE_BPS, &escrow)),
        ),
        (
            "rescue",
            hex::encode(encode_item_rescue(&coll, 2, 3, &buyer)),
        ),
        (
            "set_collection",
            hex::encode(encode_item_set_collection(&coll, true)),
        ),
        ("config", hex::encode(encode_item_config())),
        ("set_admin", hex::encode(encode_item_set_admin(&buyer))),
        ("held", hex::encode(encode_item_held(&coll, 2))),
    ];
    let body: Vec<String> = rows
        .iter()
        .map(|(k, v)| format!("  \"{k}\": \"{v}\""))
        .collect();
    format!("{{\n{}\n}}\n", body.join(",\n"))
}
