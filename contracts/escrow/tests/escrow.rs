//! Escrow tests on the Boing VM interpreter (boing-execution at the pinned rev):
//! the real reference NFT collection bytecode plus the escrow, driven through
//! signed-shape transactions, atomic batches and native-value calls. A failed
//! transaction is rolled back with a state checkpoint, like the block executor.

use boing_execution::{
    encode_mint_batch_calldata, encode_transfer_nft_calldata,
    reference_nft_collection_template_bytecode, Vm, VmError, VmExecutionContext, VmExecutionResult,
    REF_NFT_OWNER_STORAGE_XOR,
};
use boing_primitives::{
    nonce_derived_contract_address, AccessList, Account, AccountId, AccountState, BatchCall,
    Transaction, TransactionPayload, BASE_UNITS_PER_BOING as B,
};
use boing_state::StateStore;
use living_pets_escrow::*;

const OPERATOR: AccountId = AccountId([0xc8; 32]);
const ALICE: AccountId = AccountId([0xa1; 32]);
const BOB: AccountId = AccountId([0xb0; 32]);
const CAROL: AccountId = AccountId([0xca; 32]);
const MALLORY: AccountId = AccountId([0x66; 32]);

fn ctx(h: u64) -> VmExecutionContext {
    VmExecutionContext {
        block_height: h,
        block_timestamp: 0,
        native_value: false,
        vm_hardening: false,
        blake3_opcode: false,
        jump_strict: true,
        qa_canonical: false,
    }
}

fn tid(n: u64) -> [u8; 32] {
    token_word(n)
}

struct World {
    vm: Vm,
    st: StateStore,
    h: u64,
    collection: AccountId,
    escrow: AccountId,
}

impl World {
    /// Operator deploys the reference collection (nonce 0) and the escrow
    /// (nonce 1), allow-lists the collection and mints tokens 1..=5 to itself
    /// and 10..=19 to Alice.
    fn new() -> Self {
        let mut st = StateStore::new();
        for id in [OPERATOR, ALICE, BOB, CAROL, MALLORY] {
            st.insert(Account {
                id,
                state: AccountState {
                    balance: 1_000 * B,
                    ..Default::default()
                },
            });
        }
        let mut w = World {
            vm: Vm::new(),
            st,
            h: 1,
            collection: nonce_derived_contract_address(&OPERATOR, 0),
            escrow: nonce_derived_contract_address(&OPERATOR, 1),
        };
        w.send(
            OPERATOR,
            deploy(reference_nft_collection_template_bytecode(), "nft"),
        )
        .expect("deploy collection");
        w.send(OPERATOR, deploy(escrow_bytecode(&OPERATOR), "dapp"))
            .expect("deploy escrow");
        let c = w.collection;
        w.call(OPERATOR, c, mint(&OPERATOR, 1..=5))
            .expect("mint operator");
        w.call(OPERATOR, c, mint(&ALICE, 10..=19))
            .expect("mint alice");
        let e = w.escrow;
        w.call(OPERATOR, e, encode_set_collection(&c, true))
            .expect("allow");
        w
    }

    fn send(
        &mut self,
        from: AccountId,
        payload: TransactionPayload,
    ) -> Result<VmExecutionResult, VmError> {
        let nonce = self.st.get(&from).map(|s| s.nonce).unwrap_or(0);
        let mut t = Transaction {
            nonce,
            sender: from,
            payload,
            access_list: AccessList::default(),
        };
        t.access_list = t.suggested_parallel_access_list();
        self.h += 1;
        let cp = self.st.checkpoint();
        let r = self.vm.execute_with_context(&t, &mut self.st, ctx(self.h));
        if r.is_err() {
            self.st.revert(cp);
        }
        r
    }
    fn call(
        &mut self,
        from: AccountId,
        to: AccountId,
        calldata: Vec<u8>,
    ) -> Result<VmExecutionResult, VmError> {
        self.send(
            from,
            TransactionPayload::ContractCall {
                contract: to,
                calldata,
            },
        )
    }
    fn call_value(
        &mut self,
        from: AccountId,
        to: AccountId,
        calldata: Vec<u8>,
        value: u128,
    ) -> Result<VmExecutionResult, VmError> {
        self.send(
            from,
            TransactionPayload::ContractCallWithValue {
                contract: to,
                calldata,
                value,
            },
        )
    }
    /// The wallet flow: one atomic batch of prepare, transfer_nft, list.
    fn list(
        &mut self,
        seller: AccountId,
        token: u64,
        price: u128,
        buyer: Option<AccountId>,
    ) -> Result<VmExecutionResult, VmError> {
        let (c, e) = (self.collection, self.escrow);
        self.send(
            seller,
            TransactionPayload::Batch {
                calls: vec![
                    BatchCall::ContractCall {
                        contract: e,
                        calldata: encode_prepare(&c, token),
                    },
                    BatchCall::ContractCall {
                        contract: c,
                        calldata: encode_transfer_nft_calldata(&e, &tid(token)),
                    },
                    BatchCall::ContractCall {
                        contract: e,
                        calldata: encode_list(&c, token, price, buyer.as_ref()),
                    },
                ],
            },
        )
    }
    fn buy(
        &mut self,
        buyer: AccountId,
        token: u64,
        value: u128,
    ) -> Result<VmExecutionResult, VmError> {
        let (c, e) = (self.collection, self.escrow);
        self.call_value(buyer, e, encode_buy(&c, token), value)
    }
    fn owner(&self, token: u64) -> AccountId {
        let mut k = tid(token);
        for i in 0..32 {
            k[i] ^= REF_NFT_OWNER_STORAGE_XOR[i];
        }
        AccountId(self.st.get_contract_storage(&self.collection, &k))
    }
    fn bal(&self, id: &AccountId) -> u128 {
        self.st.get(id).map(|s| s.balance).unwrap_or(0)
    }
    fn listing(&self, token: u64) -> (AccountId, u128, AccountId) {
        let get = |t| {
            self.st
                .get_contract_storage(&self.escrow, &listing_key(t, 1, token))
        };
        let p = get(T_PRICE);
        (
            AccountId(get(T_SELLER)),
            u128::from_be_bytes(p[16..].try_into().unwrap()),
            AccountId(get(T_BUYER)),
        )
    }
}

fn deploy(code: Vec<u8>, purpose: &str) -> TransactionPayload {
    TransactionPayload::ContractDeployWithPurposeAndMetadata {
        bytecode: code,
        purpose_category: purpose.into(),
        description_hash: None,
        asset_name: None,
        asset_symbol: None,
        create2_salt: None,
    }
}

fn mint(to: &AccountId, ids: std::ops::RangeInclusive<u64>) -> Vec<u8> {
    let tids: Vec<[u8; 32]> = ids.map(tid).collect();
    let metas = vec![[0u8; 32]; tids.len()];
    encode_mint_batch_calldata(to, &tids, &metas)
}

const ZERO: AccountId = AccountId([0u8; 32]);

// -- QA and build -----------------------------------------------------------

#[test]
fn quality_gate_allows_the_escrow_as_a_dapp() {
    use boing_qa::{check_contract_deploy_with_blocklist, QaResult};
    let code = escrow_bytecode(&OPERATOR);
    let r = check_contract_deploy_with_blocklist(&code, Some("dapp"), 24 * 1024, &[], true, false);
    assert!(matches!(r, QaResult::Allow | QaResult::Unsure), "{r:?}");
}

#[test]
fn committed_bytecode_matches_the_builder() {
    let json = include_str!("../escrow.bytecode.json");
    let code = escrow_bytecode(&account_from_hex(OPERATOR_HEX));
    assert!(
        json.contains(&format!("\"0x{}\"", hex::encode(&code))),
        "run: cargo run --bin dump-escrow > escrow.bytecode.json"
    );
}

// -- happy paths --------------------------------------------------------------

#[test]
fn list_then_buy_pays_seller_minus_fee_and_fee_to_operator() {
    let mut w = World::new();
    let price = 10 * B;
    w.list(ALICE, 10, price, None).expect("list");
    assert_eq!(w.owner(10), w.escrow);
    assert_eq!(w.listing(10), (ALICE, price, ZERO));

    let (a0, b0, o0) = (w.bal(&ALICE), w.bal(&BOB), w.bal(&OPERATOR));
    let r = w.buy(BOB, 10, price).expect("buy");
    assert_eq!(w.owner(10), BOB);
    assert_eq!(w.bal(&ALICE) - a0, price * 9_750 / 10_000);
    assert_eq!(w.bal(&OPERATOR) - o0, price * 250 / 10_000);
    assert_eq!(b0 - w.bal(&BOB), price);
    assert_eq!(w.bal(&w.escrow.clone()), 0, "escrow keeps nothing");
    assert_eq!(w.listing(10), (ZERO, 0, ZERO), "listing cleared");
    assert_eq!(r.logs.len(), 1, "one LPESC_BUY log");
}

#[test]
fn listing_lookup_returns_seller_price_buyer() {
    let mut w = World::new();
    w.list(ALICE, 11, 3 * B, Some(CAROL)).expect("list");
    let (c, e) = (w.collection, w.escrow);
    let out = w.call(BOB, e, encode_listing(&c, 11)).expect("lookup");
    let rd = out.return_data;
    assert_eq!(rd.len(), 96);
    assert_eq!(&rd[0..32], &ALICE.0);
    assert_eq!(&rd[32..64], &word_u128(3 * B));
    assert_eq!(&rd[64..96], &CAROL.0);
    let none = w
        .call(BOB, e, encode_listing(&c, 12))
        .expect("lookup empty");
    assert_eq!(none.return_data, vec![0u8; 96]);
    let cfg = w.call(BOB, e, encode_config()).expect("config").return_data;
    assert_eq!(&cfg[0..32], &OPERATOR.0);
    assert_eq!(&cfg[32..64], &word_u128(DEFAULT_FEE_BPS));
    assert_eq!(&cfg[64..96], &OPERATOR.0);
}

#[test]
fn adoption_reserved_zero_price_listing_is_claimed_by_the_player() {
    let mut w = World::new();
    w.list(OPERATOR, 1, 0, Some(ALICE))
        .expect("operator lists for Alice");
    let (c, e) = (w.collection, w.escrow);
    assert!(w.call(BOB, e, encode_claim(&c, 1)).is_err(), "wrong player");
    assert!(w.buy(BOB, 1, 0).is_err(), "wrong player via buy");
    let o0 = w.bal(&OPERATOR);
    w.call(ALICE, e, encode_claim(&c, 1)).expect("claim");
    assert_eq!(w.owner(1), ALICE);
    assert_eq!(w.bal(&OPERATOR), o0, "no payment, no fee");
    assert!(
        w.call(ALICE, e, encode_claim(&c, 1)).is_err(),
        "claim twice"
    );
}

#[test]
fn claim_only_works_on_reserved_zero_price_listings() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    w.list(OPERATOR, 2, 0, None).expect("open free listing");
    assert!(
        w.call(BOB, e, encode_claim(&c, 2)).is_err(),
        "claim needs a reserved buyer"
    );
    w.list(OPERATOR, 3, B, Some(ALICE))
        .expect("reserved priced listing");
    assert!(
        w.call(ALICE, e, encode_claim(&c, 3)).is_err(),
        "claim needs price 0"
    );
    assert!(w.buy(BOB, 3, B).is_err(), "reserved for Alice");
    w.buy(ALICE, 3, B).expect("Alice buys her reserved listing");
    assert_eq!(w.owner(3), ALICE);
}

#[test]
fn cancel_by_seller_or_admin_returns_the_token() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    w.list(ALICE, 12, B, None).expect("list");
    w.call(ALICE, e, encode_cancel(&c, 12))
        .expect("seller cancels");
    assert_eq!(w.owner(12), ALICE);
    assert_eq!(w.listing(12), (ZERO, 0, ZERO));
    w.list(ALICE, 12, B, None).expect("relist");
    w.call(OPERATOR, e, encode_cancel(&c, 12))
        .expect("admin cancels");
    assert_eq!(w.owner(12), ALICE, "back to the seller, not the admin");
}

// -- failures -----------------------------------------------------------------

#[test]
fn double_buy_fails() {
    let mut w = World::new();
    w.list(ALICE, 13, 2 * B, None).expect("list");
    w.buy(BOB, 13, 2 * B).expect("first buy");
    let (b, c) = (w.bal(&BOB), w.bal(&CAROL));
    assert!(w.buy(CAROL, 13, 2 * B).is_err());
    assert!(w.buy(BOB, 13, 2 * B).is_err());
    assert_eq!((w.bal(&BOB), w.bal(&CAROL)), (b, c), "value refunded");
    assert_eq!(w.owner(13), BOB);
}

#[test]
fn wrong_price_fails_and_refunds() {
    let mut w = World::new();
    w.list(ALICE, 14, 5 * B, None).expect("list");
    let b = w.bal(&BOB);
    assert!(w.buy(BOB, 14, 5 * B - 1).is_err(), "underpay");
    assert!(w.buy(BOB, 14, 5 * B + 1).is_err(), "overpay");
    assert!(w.buy(BOB, 14, 0).is_err(), "no value");
    let (c, e) = (w.collection, w.escrow);
    assert!(w.call(BOB, e, encode_buy(&c, 14)).is_err(), "plain call");
    assert_eq!(w.bal(&BOB), b);
    assert_eq!(w.owner(14), w.escrow);
}

#[test]
fn non_owner_cannot_list() {
    let mut w = World::new();
    // Mallory tries the full batch on Alice's token: prepare faults.
    assert!(w.list(MALLORY, 15, B, None).is_err());
    assert_eq!(w.owner(15), ALICE);
    // Without prepare: transfer_nft silently does nothing, list faults.
    let (c, e) = (w.collection, w.escrow);
    let r = w.send(
        MALLORY,
        TransactionPayload::Batch {
            calls: vec![
                BatchCall::ContractCall {
                    contract: c,
                    calldata: encode_transfer_nft_calldata(&e, &tid(15)),
                },
                BatchCall::ContractCall {
                    contract: e,
                    calldata: encode_list(&c, 15, B, None),
                },
            ],
        },
    );
    assert!(r.is_err());
    assert_eq!(w.owner(15), ALICE);
}

#[test]
fn listing_requires_the_escrow_to_hold_the_token() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    // Alice prepares but never transfers: the list step must fault.
    let r = w.send(
        ALICE,
        TransactionPayload::Batch {
            calls: vec![
                BatchCall::ContractCall {
                    contract: e,
                    calldata: encode_prepare(&c, 19),
                },
                BatchCall::ContractCall {
                    contract: e,
                    calldata: encode_list(&c, 19, B, None),
                },
            ],
        },
    );
    assert!(r.is_err());
    assert_eq!(w.listing(19), (ZERO, 0, ZERO));
    assert_eq!(w.owner(19), ALICE);
}

#[test]
fn stranded_token_cannot_be_listed_by_anyone_and_admin_rescues_it() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    // Alice sends the token to the escrow without prepare/list.
    w.call(ALICE, c, encode_transfer_nft_calldata(&e, &tid(16)))
        .expect("plain transfer");
    assert_eq!(w.owner(16), e);
    assert!(
        w.call(MALLORY, e, encode_list(&c, 16, 1, None)).is_err(),
        "stranger"
    );
    assert!(
        w.call(ALICE, e, encode_list(&c, 16, 1, None)).is_err(),
        "even Alice, no prepare"
    );
    assert!(
        w.call(MALLORY, e, encode_rescue(&c, 16, &MALLORY)).is_err(),
        "rescue is admin only"
    );
    w.call(OPERATOR, e, encode_rescue(&c, 16, &ALICE))
        .expect("rescue");
    assert_eq!(w.owner(16), ALICE);
}

#[test]
fn rescue_never_touches_listed_tokens() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    w.list(ALICE, 17, B, None).expect("list");
    assert!(w
        .call(OPERATOR, e, encode_rescue(&c, 17, &OPERATOR))
        .is_err());
    assert_eq!(w.owner(17), e);
    assert!(
        w.call(OPERATOR, e, encode_rescue(&c, 18, &OPERATOR))
            .is_err(),
        "escrow does not hold it"
    );
}

#[test]
fn cancel_by_a_stranger_fails() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    w.list(ALICE, 18, B, None).expect("list");
    assert!(w.call(MALLORY, e, encode_cancel(&c, 18)).is_err());
    assert!(
        w.call(BOB, e, encode_cancel(&c, 19)).is_err(),
        "nothing listed"
    );
    assert_eq!(w.owner(18), e);
    assert_eq!(w.listing(18).0, ALICE);
}

#[test]
fn value_is_rejected_on_everything_but_buy() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    w.list(ALICE, 10, B, None).expect("list");
    assert!(w.call_value(ALICE, e, encode_cancel(&c, 10), 1).is_err());
    assert!(w.call_value(BOB, e, encode_listing(&c, 10), 1).is_err());
    assert!(w
        .call_value(OPERATOR, e, encode_set_fee(100, &OPERATOR), 1)
        .is_err());
}

#[test]
fn allow_list_gates_new_listings_only() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    w.list(ALICE, 10, B, None).expect("list while allowed");
    assert!(
        w.call(MALLORY, e, encode_set_collection(&c, false))
            .is_err(),
        "admin only"
    );
    w.call(OPERATOR, e, encode_set_collection(&c, false))
        .expect("disallow");
    assert!(w.list(ALICE, 11, B, None).is_err(), "new listing refused");
    w.buy(BOB, 10, B).expect("existing listing still settles");
    let info = w
        .call(BOB, e, encode_collection(&c))
        .expect("info")
        .return_data;
    assert_eq!(&info[0..32], &word_u128(1), "index kept");
    assert_eq!(&info[32..64], &word_u128(0), "not allowed");
    w.call(OPERATOR, e, encode_set_collection(&c, true))
        .expect("re-allow");
    w.list(ALICE, 11, B, None).expect("listing again");
    assert_eq!(w.listing(11).0, ALICE, "same index 1 after re-allow");
}

#[test]
fn unknown_collection_is_refused() {
    let mut w = World::new();
    // A second collection deployed by Alice, never allow-listed.
    let other = nonce_derived_contract_address(&ALICE, 0);
    w.send(
        ALICE,
        deploy(reference_nft_collection_template_bytecode(), "nft"),
    )
    .expect("deploy");
    w.call(ALICE, other, mint(&ALICE, 1..=1)).expect("mint");
    let e = w.escrow;
    assert!(w.call(ALICE, e, encode_prepare(&other, 1)).is_err());
    assert!(w.call(ALICE, e, encode_list(&other, 1, B, None)).is_err());
}

#[test]
fn token_ids_must_fit_in_u64() {
    let mut w = World::new();
    let (c, e) = (w.collection, w.escrow);
    let mut cd = encode_listing(&c, 0);
    cd[32 + 32] = 1; // token word with a high byte set
    assert!(w.call(BOB, e, cd).is_err());
}

// -- fee ------------------------------------------------------------------------

#[test]
fn fee_math_rounds_down_and_never_loses_wei() {
    let mut w = World::new();
    let cases: [(u64, u128); 6] = [
        (10, 1),
        (11, 39),
        (12, 40),
        (13, 399),
        (14, 7 * B + 3),
        (15, 123_456_789_012_345_678_901),
    ];
    for (token, price) in cases {
        w.list(ALICE, token, price, None).expect("list");
        let (a0, o0) = (w.bal(&ALICE), w.bal(&OPERATOR));
        w.buy(BOB, token, price).expect("buy");
        let (fee, net) = split_price(price, 250);
        assert_eq!(w.bal(&OPERATOR) - o0, fee, "fee for {price}");
        assert_eq!(w.bal(&ALICE) - a0, net, "net for {price}");
        assert_eq!(fee + net, price);
        assert_eq!(fee, price * 250 / 10_000);
    }
    assert_eq!(split_price(1, 250), (0, 1));
    assert_eq!(split_price(40, 250), (1, 39));
    assert_eq!(split_price(399, 250), (9, 390));
    assert_eq!(w.bal(&w.escrow.clone()), 0);
}

#[test]
fn set_fee_is_admin_only_capped_at_ten_percent() {
    let mut w = World::new();
    let e = w.escrow;
    assert!(
        w.call(MALLORY, e, encode_set_fee(0, &MALLORY)).is_err(),
        "stranger"
    );
    assert!(
        w.call(OPERATOR, e, encode_set_fee(1_001, &OPERATOR))
            .is_err(),
        "over cap"
    );
    assert!(
        w.call(OPERATOR, e, encode_set_fee(500, &ZERO)).is_err(),
        "zero fee account"
    );
    w.call(OPERATOR, e, encode_set_fee(1_000, &CAROL))
        .expect("10% to Carol");
    w.list(ALICE, 10, 10 * B, None).expect("list");
    let (a0, c0) = (w.bal(&ALICE), w.bal(&CAROL));
    w.buy(BOB, 10, 10 * B).expect("buy");
    assert_eq!(w.bal(&CAROL) - c0, B);
    assert_eq!(w.bal(&ALICE) - a0, 9 * B);
    w.call(OPERATOR, e, encode_set_fee(0, &OPERATOR))
        .expect("fee off");
    w.list(ALICE, 11, 10 * B, None).expect("list");
    let a1 = w.bal(&ALICE);
    w.buy(BOB, 11, 10 * B).expect("buy");
    assert_eq!(w.bal(&ALICE) - a1, 10 * B);
}

#[test]
fn set_admin_hands_over_control() {
    let mut w = World::new();
    let e = w.escrow;
    assert!(w.call(MALLORY, e, encode_set_admin(&MALLORY)).is_err());
    assert!(w.call(OPERATOR, e, encode_set_admin(&ZERO)).is_err());
    w.call(OPERATOR, e, encode_set_admin(&CAROL))
        .expect("hand over");
    assert!(
        w.call(OPERATOR, e, encode_set_fee(100, &OPERATOR)).is_err(),
        "old admin"
    );
    w.call(CAROL, e, encode_set_fee(100, &CAROL))
        .expect("new admin");
}

// -- reentrancy -------------------------------------------------------------------

/// A hostile "collection" (imagine a bad allow-list entry): owner_of reads
/// storage, transfer_nft moves the token without checks and, once armed,
/// re-enters `escrow.buy(self, token)` from inside the escrow's own transfer.
fn hostile_collection(escrow: &AccountId) -> Vec<u8> {
    use boing_execution::Opcode as O;
    let mut c: Vec<u8> = Vec::new();
    let p32 = |c: &mut Vec<u8>, w: [u8; 32]| {
        c.push(O::Push32 as u8);
        c.extend_from_slice(&w);
    };
    let u = |n: u64| word_u128(n as u128);
    let arm_key = tag(b"ARMED");
    // sel = mload(0) & 0xff -> mem[400]
    p32(&mut c, u(0));
    c.push(O::MLoad as u8);
    p32(&mut c, u(0xff));
    c.push(O::And as u8);
    p32(&mut c, u(400));
    c.push(O::MStore as u8);
    let mut fix = Vec::new();
    for sel in [3u64, 4, 9] {
        p32(&mut c, u(400));
        c.push(O::MLoad as u8);
        p32(&mut c, u(sel));
        c.push(O::Eq as u8);
        fix.push(c.len());
        p32(&mut c, u(0));
        c.push(O::JumpI as u8);
    }
    c.push(O::Stop as u8);
    let set = |c: &mut Vec<u8>, at: usize| {
        let d = u(c.len() as u64);
        c[at + 1..at + 33].copy_from_slice(&d);
    };
    // owner_of: return sload(token)
    set(&mut c, fix[0]);
    p32(&mut c, u(32));
    c.push(O::MLoad as u8);
    c.push(O::SLoad as u8);
    p32(&mut c, u(512));
    c.push(O::MStore as u8);
    p32(&mut c, u(32));
    p32(&mut c, u(512));
    c.push(O::Return as u8);
    // transfer_nft(to, token): sstore(token, to); if armed: CALL escrow.buy(self, token)
    set(&mut c, fix[1]);
    p32(&mut c, u(32));
    c.push(O::MLoad as u8);
    p32(&mut c, u(64));
    c.push(O::MLoad as u8);
    c.push(O::SStore as u8);
    p32(&mut c, arm_key);
    c.push(O::SLoad as u8);
    c.push(O::IsZero as u8);
    let skip = c.len();
    p32(&mut c, u(0));
    c.push(O::JumpI as u8);
    p32(&mut c, selector_word(SEL_BUY));
    p32(&mut c, u(600));
    c.push(O::MStore as u8);
    c.push(O::Address as u8);
    p32(&mut c, u(632));
    c.push(O::MStore as u8);
    p32(&mut c, u(64));
    c.push(O::MLoad as u8);
    p32(&mut c, u(664));
    c.push(O::MStore as u8);
    p32(&mut c, escrow.0);
    p32(&mut c, u(600));
    p32(&mut c, u(96));
    p32(&mut c, u(700));
    p32(&mut c, u(0));
    c.push(O::Call as u8);
    set(&mut c, skip);
    c.push(O::Stop as u8);
    // arm
    set(&mut c, fix[2]);
    p32(&mut c, u(1));
    p32(&mut c, arm_key);
    c.push(O::SStore as u8);
    c.push(O::Stop as u8);
    c
}

#[test]
fn reentrant_buy_from_a_hostile_collection_reverts_the_whole_sale() {
    let mut w = World::new();
    let e = w.escrow;
    let hostile = nonce_derived_contract_address(&MALLORY, 0);
    w.send(MALLORY, deploy(hostile_collection(&e), "dapp"))
        .expect("deploy hostile");
    w.call(OPERATOR, e, encode_set_collection(&hostile, true))
        .expect("bad allow-list entry");
    // Mallory "owns" token 7 in the hostile collection, then lists it.
    let mut give = encode_transfer_nft_calldata(&MALLORY, &tid(7));
    give.truncate(96);
    w.call(MALLORY, hostile, give).expect("self-mint");
    w.send(
        MALLORY,
        TransactionPayload::Batch {
            calls: vec![
                BatchCall::ContractCall {
                    contract: e,
                    calldata: encode_prepare(&hostile, 7),
                },
                BatchCall::ContractCall {
                    contract: hostile,
                    calldata: encode_transfer_nft_calldata(&e, &tid(7)),
                },
                BatchCall::ContractCall {
                    contract: e,
                    calldata: encode_list(&hostile, 7, 4 * B, None),
                },
            ],
        },
    )
    .expect("list on hostile collection");
    w.call(MALLORY, hostile, selector_word(9).to_vec())
        .expect("arm");
    let (b0, m0) = (w.bal(&BOB), w.bal(&MALLORY));
    // Bob buys: the escrow clears the listing, calls transfer_nft, the hostile
    // contract re-enters buy (no listing left, no value in nested frames),
    // the nested buy faults and the fault reverts Bob's whole transaction.
    let err = w
        .call_value(BOB, e, encode_buy(&hostile, 7), 4 * B)
        .expect_err("sale must revert");
    assert!(
        matches!(err, VmError::InvalidJump),
        "nested buy faults: {err:?}"
    );
    assert_eq!(w.bal(&BOB), b0, "Bob refunded");
    assert_eq!(w.bal(&MALLORY), m0, "Mallory paid nothing extra");
    let lst = w
        .call(BOB, e, encode_listing(&hostile, 7))
        .expect("lookup")
        .return_data;
    assert_eq!(&lst[0..32], &MALLORY.0, "listing restored by the revert");
}

// -- gas ------------------------------------------------------------------------------

#[test]
fn gas_report() {
    let mut w = World::new();
    let list = w.list(ALICE, 10, B, None).expect("list").gas_used;
    let buy = w.buy(BOB, 10, B).expect("buy").gas_used;
    w.list(OPERATOR, 1, 0, Some(ALICE)).expect("list");
    let (c, e) = (w.collection, w.escrow);
    let claim = w
        .call(ALICE, e, encode_claim(&c, 1))
        .expect("claim")
        .gas_used;
    w.list(ALICE, 11, B, None).expect("list");
    let cancel = w
        .call(ALICE, e, encode_cancel(&c, 11))
        .expect("cancel")
        .gas_used;
    let bytes = escrow_bytecode(&OPERATOR).len();
    eprintln!(
        "escrow bytes={bytes} gas: list(batch)={list} buy={buy} claim={claim} cancel={cancel}"
    );
    assert!(buy < 200_000 && list < 200_000);
}

#[test]
fn committed_abi_vectors_match_the_encoders() {
    assert_eq!(
        include_str!("../abi-vectors.json").replace("\r\n", "\n"),
        abi_vectors_json(),
        "run: cargo run --bin dump-escrow vectors > abi-vectors.json"
    );
}
