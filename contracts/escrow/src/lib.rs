//! Living Pets marketplace escrow: Boing VM bytecode builder.
//!
//! The escrow holds NFTs from allow-listed reference NFT collections while they
//! are listed, and settles sales in native BOING:
//!
//! - `list` (0x40): the holder moves the token to the escrow with
//!   `transfer_nft` and calls `list` in the same atomic batch. The escrow
//!   checks with `owner_of` that it really holds the token, then records the
//!   seller (`CALLER`), the price and an optional reserved buyer.
//! - `cancel` (0x41): seller or admin; the token goes back to the seller.
//! - `buy` (0x42): `ContractCallWithValue` with exactly the price. The token
//!   goes to the buyer, the fee (`price * fee_bps / 10_000`, floored) to the
//!   fee account, the rest to the seller.
//! - `claim` (0x43): a reserved listing at price 0 (adoption). Only the
//!   reserved player may claim it.
//! - `listing` (0x44): read `(seller, price, buyer)`.
//! - `set_fee` (0x45): admin; `fee_bps <= 1000` (10%), nonzero fee account.
//! - `rescue` (0x46): admin; returns a token the escrow holds without a
//!   listing (for example a transfer that was not batched with `list`).
//! - `set_collection` (0x47): admin allow-list.
//! - `config` (0x48), `set_admin` (0x49), `collection` (0x4a).
//!
//! Every failed check faults (jump out of range), which reverts the whole
//! transaction including any attached value. Listings are cleared before any
//! outgoing call (checks, effects, interactions), `NATIVE_TRANSFER` never runs
//! recipient code, and nested calls carry no value, so re-entering the escrow
//! during a settlement finds no listing to act on.
//!
//! The reference NFT `transfer_nft` does **not** fault when the caller is not
//! the owner: it silently stops. So every transfer the escrow makes is followed
//! by an `owner_of` check.

use boing_execution::Opcode as O;
use boing_primitives::AccountId;
use std::collections::HashMap;

pub const SEL_LIST: u8 = 0x40;
pub const SEL_CANCEL: u8 = 0x41;
pub const SEL_BUY: u8 = 0x42;
pub const SEL_CLAIM: u8 = 0x43;
pub const SEL_LISTING: u8 = 0x44;
pub const SEL_SET_FEE: u8 = 0x45;
pub const SEL_RESCUE: u8 = 0x46;
pub const SEL_SET_COLLECTION: u8 = 0x47;
pub const SEL_CONFIG: u8 = 0x48;
pub const SEL_SET_ADMIN: u8 = 0x49;
pub const SEL_COLLECTION: u8 = 0x4a;

/// Default market fee: 2.5%, paid to the admin until `set_fee` runs.
pub const DEFAULT_FEE_BPS: u128 = 250;
/// Hard cap on the market fee: 10%.
pub const MAX_FEE_BPS: u128 = 1_000;
pub const BPS_DENOMINATOR: u128 = 10_000;

/// Reference NFT selectors the escrow calls.
const NFT_OWNER_OF: u8 = 0x03;
const NFT_TRANSFER: u8 = 0x04;

/// ASCII tag in the high bytes of a storage word.
pub const fn tag(s: &[u8]) -> [u8; 32] {
    let mut w = [0u8; 32];
    let mut i = 0;
    while i < s.len() && i < 16 {
        w[i] = s[i];
        i += 1;
    }
    w
}

pub const K_ADMIN: [u8; 32] = tag(b"LPESC_ADMIN");
pub const K_FEE_BPS: [u8; 32] = tag(b"LPESC_FEEBPS");
pub const K_FEE_TO: [u8; 32] = tag(b"LPESC_FEETO");
pub const K_NEXT_INDEX: [u8; 32] = tag(b"LPESC_NEXTIDX");
/// `collection ^ T_COLL_INDEX` = collection index (1, 2, ...), never reused.
pub const T_COLL_INDEX: [u8; 32] = tag(b"LPESC_CIDX");
/// `collection ^ T_COLL_OK` = 1 when `list` accepts the collection.
pub const T_COLL_OK: [u8; 32] = tag(b"LPESC_COK");
/// Listing fields: `tag + index * 2^64 + token` (token < 2^64).
pub const T_SELLER: [u8; 32] = tag(b"LPESC_SELLER");
pub const T_PRICE: [u8; 32] = tag(b"LPESC_PRICE");
pub const T_BUYER: [u8; 32] = tag(b"LPESC_BUYER");
/// Log topic0 values.
pub const LOG_LIST: [u8; 32] = tag(b"LPESC_LIST");
pub const LOG_CANCEL: [u8; 32] = tag(b"LPESC_CANCEL");
pub const LOG_BUY: [u8; 32] = tag(b"LPESC_BUY");

// Scratch memory (calldata occupies 0..160).
const M_SEL: u64 = 256;
const M_COLL: u64 = 288;
const M_TOK: u64 = 320;
const M_IDX: u64 = 352;
const M_SELLER: u64 = 384; // seller, price, buyer are contiguous (listing return)
const M_PRICE: u64 = 416;
const M_BUYER: u64 = 448;
const M_ADMIN: u64 = 480; // admin, fee bps, fee to are contiguous (config return)
const M_FEE_BPS: u64 = 512;
const M_FEE_TO: u64 = 544;
const M_FEE: u64 = 576;
const M_MODE: u64 = 608;
const M_TO: u64 = 640;
const M_ARGS: u64 = 672; // 3 words
const M_RET: u64 = 768;
const M_OUT: u64 = 800;

pub fn word_u128(n: u128) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[16..].copy_from_slice(&n.to_be_bytes());
    w
}

pub fn selector_word(sel: u8) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[31] = sel;
    w
}

fn xor(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    let mut w = [0u8; 32];
    for i in 0..32 {
        w[i] = a[i] ^ b[i];
    }
    w
}

/// Storage key of a listing field (mirrors the bytecode; for tests and indexers).
pub fn listing_key(field_tag: [u8; 32], collection_index: u64, token: u64) -> [u8; 32] {
    let mut w = field_tag;
    w[16..24].copy_from_slice(&collection_index.to_be_bytes());
    w[24..32].copy_from_slice(&token.to_be_bytes());
    w
}

pub fn collection_index_key(collection: &AccountId) -> [u8; 32] {
    xor(collection.0, T_COLL_INDEX)
}

pub fn collection_ok_key(collection: &AccountId) -> [u8; 32] {
    xor(collection.0, T_COLL_OK)
}

/// Tiny label-resolving assembler over `PUSH32` jump targets.
struct Asm {
    code: Vec<u8>,
    labels: HashMap<String, usize>,
    fixups: Vec<(usize, String)>,
    n: usize,
}

impl Asm {
    fn new() -> Self {
        Self { code: Vec::new(), labels: HashMap::new(), fixups: Vec::new(), n: 0 }
    }
    fn op(&mut self, o: O) {
        self.code.push(o as u8);
    }
    fn push(&mut self, w: [u8; 32]) {
        self.code.push(O::Push32 as u8);
        self.code.extend_from_slice(&w);
    }
    fn push_u(&mut self, n: u128) {
        self.push(word_u128(n));
    }
    fn push_label(&mut self, l: &str) {
        let at = self.code.len();
        self.push([0u8; 32]);
        self.fixups.push((at, l.to_string()));
    }
    fn label(&mut self, l: &str) {
        let prev = self.labels.insert(l.to_string(), self.code.len());
        assert!(prev.is_none(), "duplicate label {l}");
    }
    fn fresh(&mut self, p: &str) -> String {
        self.n += 1;
        format!("{p}#{}", self.n)
    }
    fn jump(&mut self, l: &str) {
        self.push_label(l);
        self.op(O::Jump);
    }
    /// Jump to `l` when the word on the stack is nonzero.
    fn jumpi(&mut self, l: &str) {
        self.push_label(l);
        self.op(O::JumpI);
    }
    fn mload(&mut self, off: u64) {
        self.push_u(off as u128);
        self.op(O::MLoad);
    }
    fn mstore(&mut self, off: u64) {
        self.push_u(off as u128);
        self.op(O::MStore);
    }
    /// Fault unless the word on the stack is nonzero.
    fn require(&mut self) {
        self.op(O::IsZero);
        self.jumpi("fault");
    }
    fn finish(mut self) -> Vec<u8> {
        for (at, l) in &self.fixups {
            let dest = *self.labels.get(l).unwrap_or_else(|| panic!("missing label {l}"));
            self.code[at + 1..at + 33].copy_from_slice(&word_u128(dest as u128));
        }
        self.code
    }

    // -- contract helpers --------------------------------------------------

    /// Push the storage key of a listing field for (M_IDX, M_TOK).
    fn listing_key(&mut self, field: [u8; 32]) {
        self.push(field);
        self.mload(M_IDX);
        self.push_u(1u128 << 64);
        self.op(O::Mul);
        self.op(O::Add);
        self.mload(M_TOK);
        self.op(O::Add);
    }
    fn coll_key(&mut self, t: [u8; 32]) {
        self.mload(M_COLL);
        self.push(t);
        self.op(O::Xor);
    }
    /// Collection and token from calldata words 1 and 2; token < 2^64; index.
    fn load_coll_tok(&mut self) {
        self.mload(32);
        self.mstore(M_COLL);
        self.mload(64);
        self.mstore(M_TOK);
        self.mload(M_TOK);
        self.push_u(1u128 << 64);
        self.op(O::Lt);
        self.require();
        self.coll_key(T_COLL_INDEX);
        self.op(O::SLoad);
        self.mstore(M_IDX);
    }
    fn load_listing(&mut self) {
        for (t, m) in [(T_SELLER, M_SELLER), (T_PRICE, M_PRICE), (T_BUYER, M_BUYER)] {
            self.listing_key(t);
            self.op(O::SLoad);
            self.mstore(m);
        }
    }
    fn store_listing(&mut self) {
        for (t, m) in [(T_SELLER, M_SELLER), (T_PRICE, M_PRICE), (T_BUYER, M_BUYER)] {
            self.mload(m);
            self.listing_key(t);
            self.op(O::SStore);
        }
    }
    fn clear_listing(&mut self) {
        for t in [T_SELLER, T_PRICE, T_BUYER] {
            self.push_u(0);
            self.listing_key(t);
            self.op(O::SStore);
        }
    }
    fn require_admin(&mut self) {
        self.op(O::Caller);
        self.mload(M_ADMIN);
        self.op(O::Eq);
        self.require();
    }
    /// Nested call into the collection with a 3-word reference NFT calldata.
    fn nft_call(&mut self, sel: u8, word1: impl Fn(&mut Asm), word2: impl Fn(&mut Asm), ret: u64) {
        self.push(selector_word(sel));
        self.mstore(M_ARGS);
        word1(self);
        self.mstore(M_ARGS + 32);
        word2(self);
        self.mstore(M_ARGS + 64);
        self.mload(M_COLL); // target
        self.push_u(M_ARGS as u128);
        self.push_u(96);
        self.push_u(M_RET as u128);
        self.push_u(ret as u128);
        self.op(O::Call);
        self.require();
    }
    /// Fault unless `owner_of(M_TOK)` equals the word `expected` pushes.
    fn require_owner(&mut self, expected: impl Fn(&mut Asm)) {
        self.push_u(0);
        self.mstore(M_RET);
        self.nft_call(NFT_OWNER_OF, |a| a.mload(M_TOK), |a| a.push_u(0), 32);
        self.mload(M_RET);
        expected(self);
        self.op(O::Eq);
        self.require();
    }
    /// `transfer_nft(to = mem[to_mem], M_TOK)`, then check the new owner.
    fn transfer_to(&mut self, to_mem: u64) {
        self.nft_call(NFT_TRANSFER, |a| a.mload(to_mem), |a| a.mload(M_TOK), 0);
        self.require_owner(|a| a.mload(to_mem));
    }
    /// LOG3(topic0, collection, token) with data = seller, price, buyer.
    fn log_listing(&mut self, topic0: [u8; 32]) {
        self.push(topic0);
        self.mload(M_COLL);
        self.mload(M_TOK);
        self.push_u(96);
        self.push_u(M_SELLER as u128);
        self.op(O::Log3);
    }
}

/// Escrow runtime bytecode. `admin` is baked in (no lazy-admin race at
/// deploy) and receives the default 2.5% fee until `set_fee` runs.
pub fn escrow_bytecode(admin: &AccountId) -> Vec<u8> {
    let mut a = Asm::new();

    // Selector.
    a.mload(0);
    a.push_u(0xff);
    a.op(O::And);
    a.mstore(M_SEL);

    // Only `buy` accepts value.
    a.mload(M_SEL);
    a.push_u(SEL_BUY as u128);
    a.op(O::Eq);
    a.jumpi("value_ok");
    a.op(O::CallValue);
    a.op(O::IsZero);
    a.require();
    a.label("value_ok");

    // Admin: storage override, else the baked deployer.
    a.push(K_ADMIN);
    a.op(O::SLoad);
    a.mstore(M_ADMIN);
    a.mload(M_ADMIN);
    a.jumpi("admin_ok");
    a.push(admin.0);
    a.mstore(M_ADMIN);
    a.label("admin_ok");

    // Fee: configured (fee account set), else 2.5% to the admin.
    a.push(K_FEE_TO);
    a.op(O::SLoad);
    a.mstore(M_FEE_TO);
    a.mload(M_FEE_TO);
    a.op(O::IsZero);
    a.jumpi("fee_default");
    a.push(K_FEE_BPS);
    a.op(O::SLoad);
    a.mstore(M_FEE_BPS);
    a.jump("fee_ok");
    a.label("fee_default");
    a.push_u(DEFAULT_FEE_BPS);
    a.mstore(M_FEE_BPS);
    a.mload(M_ADMIN);
    a.mstore(M_FEE_TO);
    a.label("fee_ok");

    // Dispatch.
    for (sel, l) in [
        (SEL_LIST, "list"),
        (SEL_CANCEL, "cancel"),
        (SEL_BUY, "buy"),
        (SEL_CLAIM, "claim"),
        (SEL_LISTING, "listing"),
        (SEL_SET_FEE, "set_fee"),
        (SEL_RESCUE, "rescue"),
        (SEL_SET_COLLECTION, "set_collection"),
        (SEL_CONFIG, "config"),
        (SEL_SET_ADMIN, "set_admin"),
        (SEL_COLLECTION, "collection"),
    ] {
        a.mload(M_SEL);
        a.push_u(sel as u128);
        a.op(O::Eq);
        a.jumpi(l);
    }
    a.jump("fault");

    // -- list(collection, token, price, buyer) ------------------------------
    a.label("list");
    a.load_coll_tok();
    a.coll_key(T_COLL_OK);
    a.op(O::SLoad);
    a.require();
    a.mload(96);
    a.mstore(M_PRICE);
    a.mload(M_PRICE);
    a.push_u(u128::MAX);
    a.push_u(1);
    a.op(O::Add); // 2^128
    a.op(O::Lt);
    a.require();
    a.mload(128);
    a.mstore(M_BUYER);
    a.listing_key(T_SELLER);
    a.op(O::SLoad);
    a.op(O::IsZero);
    a.require();
    a.require_owner(|a| a.op(O::Address));
    a.op(O::Caller);
    a.mstore(M_SELLER);
    a.store_listing();
    a.log_listing(LOG_LIST);
    a.op(O::Stop);

    // -- cancel(collection, token) -------------------------------------------
    a.label("cancel");
    a.load_coll_tok();
    a.mload(M_IDX);
    a.require();
    a.load_listing();
    a.mload(M_SELLER);
    a.require();
    a.op(O::Caller);
    a.mload(M_SELLER);
    a.op(O::Eq);
    a.op(O::Caller);
    a.mload(M_ADMIN);
    a.op(O::Eq);
    a.op(O::Or);
    a.require();
    a.clear_listing();
    a.transfer_to(M_SELLER);
    a.log_listing(LOG_CANCEL);
    a.op(O::Stop);

    // -- buy(collection, token) / claim(collection, token) -------------------
    a.label("buy");
    a.push_u(0);
    a.mstore(M_MODE);
    a.jump("trade");
    a.label("claim");
    a.push_u(1);
    a.mstore(M_MODE);
    a.label("trade");
    a.load_coll_tok();
    a.mload(M_IDX);
    a.require();
    a.load_listing();
    a.mload(M_SELLER);
    a.require();
    let open = a.fresh("open");
    a.mload(M_BUYER);
    a.op(O::IsZero);
    a.jumpi(&open);
    a.op(O::Caller);
    a.mload(M_BUYER);
    a.op(O::Eq);
    a.require();
    a.label(&open);
    a.op(O::CallValue);
    a.mload(M_PRICE);
    a.op(O::Eq);
    a.require();
    let mode_ok = a.fresh("mode_ok");
    a.mload(M_MODE);
    a.op(O::IsZero);
    a.jumpi(&mode_ok);
    a.mload(M_PRICE);
    a.op(O::IsZero);
    a.require();
    a.mload(M_BUYER);
    a.require();
    a.label(&mode_ok);
    a.clear_listing();
    a.op(O::Caller);
    a.mstore(M_BUYER);
    a.transfer_to(M_BUYER);
    let paid = a.fresh("paid");
    let no_fee = a.fresh("no_fee");
    a.mload(M_PRICE);
    a.op(O::IsZero);
    a.jumpi(&paid);
    a.mload(M_PRICE);
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
    a.mload(M_PRICE);
    a.mload(M_FEE);
    a.op(O::Sub);
    a.mload(M_SELLER);
    a.op(O::NativeTransfer);
    a.label(&paid);
    a.log_listing(LOG_BUY);
    a.op(O::Stop);

    // -- listing(collection, token) -> (seller, price, buyer) ----------------
    a.label("listing");
    a.load_coll_tok();
    a.load_listing();
    a.push_u(96);
    a.push_u(M_SELLER as u128);
    a.op(O::Return);

    // -- set_fee(bps, fee_to) -------------------------------------------------
    a.label("set_fee");
    a.require_admin();
    a.mload(32);
    a.push_u(MAX_FEE_BPS + 1);
    a.op(O::Lt);
    a.require();
    a.mload(64);
    a.require();
    a.mload(32);
    a.push(K_FEE_BPS);
    a.op(O::SStore);
    a.mload(64);
    a.push(K_FEE_TO);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- rescue(collection, token, to) ----------------------------------------
    a.label("rescue");
    a.require_admin();
    a.load_coll_tok();
    let unindexed = a.fresh("unindexed");
    a.mload(M_IDX);
    a.op(O::IsZero);
    a.jumpi(&unindexed);
    a.listing_key(T_SELLER);
    a.op(O::SLoad);
    a.op(O::IsZero);
    a.require();
    a.label(&unindexed);
    a.mload(96);
    a.mstore(M_TO);
    a.mload(M_TO);
    a.require();
    a.require_owner(|a| a.op(O::Address));
    a.transfer_to(M_TO);
    a.op(O::Stop);

    // -- set_collection(collection, allowed) ---------------------------------
    a.label("set_collection");
    a.require_admin();
    a.mload(32);
    a.mstore(M_COLL);
    a.mload(M_COLL);
    a.require();
    a.coll_key(T_COLL_INDEX);
    a.op(O::SLoad);
    a.jumpi("has_index");
    a.push(K_NEXT_INDEX);
    a.op(O::SLoad);
    a.push_u(1);
    a.op(O::Add);
    a.mstore(M_IDX);
    a.mload(M_IDX);
    a.push(K_NEXT_INDEX);
    a.op(O::SStore);
    a.mload(M_IDX);
    a.coll_key(T_COLL_INDEX);
    a.op(O::SStore);
    a.label("has_index");
    a.mload(64);
    a.op(O::IsZero);
    a.op(O::IsZero);
    a.coll_key(T_COLL_OK);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- config() -> (admin, fee_bps, fee_to) ---------------------------------
    a.label("config");
    a.push_u(96);
    a.push_u(M_ADMIN as u128);
    a.op(O::Return);

    // -- set_admin(new_admin) -------------------------------------------------
    a.label("set_admin");
    a.require_admin();
    a.mload(32);
    a.require();
    a.mload(32);
    a.push(K_ADMIN);
    a.op(O::SStore);
    a.op(O::Stop);

    // -- collection(collection) -> (index, allowed) ---------------------------
    a.label("collection");
    a.mload(32);
    a.mstore(M_COLL);
    a.coll_key(T_COLL_INDEX);
    a.op(O::SLoad);
    a.mstore(M_OUT);
    a.coll_key(T_COLL_OK);
    a.op(O::SLoad);
    a.mstore(M_OUT + 32);
    a.push_u(64);
    a.push_u(M_OUT as u128);
    a.op(O::Return);

    // Any failed check lands here: jump out of range faults and reverts.
    a.label("fault");
    a.push_u(u64::MAX as u128);
    a.op(O::Jump);

    a.finish()
}

// -- calldata encoders (mirrored in apps/sim-host/src/market/escrow-abi.ts) ----

fn words(sel: u8, args: &[[u8; 32]]) -> Vec<u8> {
    let mut v = selector_word(sel).to_vec();
    for w in args {
        v.extend_from_slice(w);
    }
    v
}

pub fn token_word(token: u64) -> [u8; 32] {
    word_u128(token as u128)
}

pub fn encode_list(collection: &AccountId, token: u64, price: u128, buyer: Option<&AccountId>) -> Vec<u8> {
    words(SEL_LIST, &[collection.0, token_word(token), word_u128(price), buyer.map(|b| b.0).unwrap_or([0u8; 32])])
}
pub fn encode_cancel(collection: &AccountId, token: u64) -> Vec<u8> {
    words(SEL_CANCEL, &[collection.0, token_word(token)])
}
pub fn encode_buy(collection: &AccountId, token: u64) -> Vec<u8> {
    words(SEL_BUY, &[collection.0, token_word(token)])
}
pub fn encode_claim(collection: &AccountId, token: u64) -> Vec<u8> {
    words(SEL_CLAIM, &[collection.0, token_word(token)])
}
pub fn encode_listing(collection: &AccountId, token: u64) -> Vec<u8> {
    words(SEL_LISTING, &[collection.0, token_word(token)])
}
pub fn encode_set_fee(bps: u128, fee_to: &AccountId) -> Vec<u8> {
    words(SEL_SET_FEE, &[word_u128(bps), fee_to.0])
}
pub fn encode_rescue(collection: &AccountId, token: u64, to: &AccountId) -> Vec<u8> {
    words(SEL_RESCUE, &[collection.0, token_word(token), to.0])
}
pub fn encode_set_collection(collection: &AccountId, allowed: bool) -> Vec<u8> {
    words(SEL_SET_COLLECTION, &[collection.0, word_u128(allowed as u128)])
}
pub fn encode_config() -> Vec<u8> {
    words(SEL_CONFIG, &[])
}
pub fn encode_set_admin(admin: &AccountId) -> Vec<u8> {
    words(SEL_SET_ADMIN, &[admin.0])
}
pub fn encode_collection(collection: &AccountId) -> Vec<u8> {
    words(SEL_COLLECTION, &[collection.0])
}

/// Fee split the bytecode applies: `(fee, seller_amount)`.
pub fn split_price(price: u128, fee_bps: u128) -> (u128, u128) {
    let fee = price * fee_bps / BPS_DENOMINATOR;
    (fee, price - fee)
}

pub fn account_from_hex(hex_str: &str) -> AccountId {
    let s = hex_str.trim_start_matches("0x");
    let v = hex::decode(s).expect("hex account");
    let mut a = [0u8; 32];
    a.copy_from_slice(&v);
    AccountId(a)
}

/// The operator wallet that deploys and administers the escrow.
pub const OPERATOR_HEX: &str = "0xc8b386c732a9f00c7ccd28aa4a8c377634057d6b5604099f4809a8fee58af6f8";