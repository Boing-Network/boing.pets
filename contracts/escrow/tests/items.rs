//! Item escrow tests on the Boing VM interpreter (boing-execution at the
//! pinned rev): the real reference multi-token (LPIT template) plus the item
//! escrow, driven through signed-shape transactions, atomic batches and
//! native-value calls. A failed transaction is rolled back with a state
//! checkpoint, like the block executor.

use boing_execution::{
    encode_mt_mint_calldata, encode_mt_transfer_calldata, multi_token_balance_storage_key,
    reference_multi_token_deploy_bytecode, Vm, VmError, VmExecutionContext, VmExecutionResult,
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
const ZERO: AccountId = AccountId([0u8; 32]);

const VITALITY: u64 = 1;
const CALM: u64 = 2;
const RATIONS: u64 = 3;

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

#[derive(Debug, PartialEq)]
struct Listing {
    seller: AccountId,
    collection: AccountId,
    item: u64,
    price: u128,
    listed: u64,
    remaining: u64,
    open: bool,
    fills: u64,
}

fn word_u(w: &[u8]) -> u128 {
    u128::from_be_bytes(w[16..32].try_into().unwrap())
}

struct World {
    vm: Vm,
    st: StateStore,
    h: u64,
    lpit: AccountId,
    escrow: AccountId,
}

impl World {
    /// Operator deploys the LPIT template (nonce 0) and the item escrow
    /// (nonce 1), allow-lists LPIT and mints Alice 5 Vitality, 3 Calm and 2
    /// Rations, Bob 4 Calm.
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
            lpit: nonce_derived_contract_address(&OPERATOR, 0),
            escrow: nonce_derived_contract_address(&OPERATOR, 1),
        };
        w.send(
            OPERATOR,
            deploy(reference_multi_token_deploy_bytecode(), "nft"),
        )
        .expect("deploy lpit");
        w.send(OPERATOR, deploy(item_escrow_bytecode(&OPERATOR), "dapp"))
            .expect("deploy item escrow");
        let c = w.lpit;
        for (to, item, n) in [
            (ALICE, VITALITY, 5u128),
            (ALICE, CALM, 3),
            (ALICE, RATIONS, 2),
            (BOB, CALM, 4),
        ] {
            w.call(OPERATOR, c, encode_mt_mint_calldata(&to, item, n))
                .expect("mint");
        }
        let e = w.escrow;
        w.call(OPERATOR, e, encode_item_set_collection(&c, true))
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
    fn batch(
        &mut self,
        from: AccountId,
        calls: Vec<(AccountId, Vec<u8>)>,
    ) -> Result<VmExecutionResult, VmError> {
        self.send(
            from,
            TransactionPayload::Batch {
                calls: calls
                    .into_iter()
                    .map(|(contract, calldata)| BatchCall::ContractCall { contract, calldata })
                    .collect(),
            },
        )
    }
    /// The wallet flow: one atomic batch of prepare, transfer, list.
    fn list(
        &mut self,
        seller: AccountId,
        item: u64,
        qty: u64,
        unit: u128,
    ) -> Result<VmExecutionResult, VmError> {
        let (c, e) = (self.lpit, self.escrow);
        self.batch(
            seller,
            vec![
                (e, encode_item_prepare(&c, item)),
                (c, encode_mt_transfer_calldata(&e, item, qty as u128)),
                (e, encode_item_list(&c, item, qty, unit)),
            ],
        )
    }
    fn buy(
        &mut self,
        buyer: AccountId,
        id: u64,
        qty: u64,
        value: u128,
    ) -> Result<VmExecutionResult, VmError> {
        let e = self.escrow;
        self.call_value(buyer, e, encode_item_buy(id, qty), value)
    }
    fn units(&self, who: &AccountId, item: u64) -> u128 {
        word_u(
            &self
                .st
                .get_contract_storage(&self.lpit, &multi_token_balance_storage_key(who, item)),
        )
    }
    fn bal(&self, id: &AccountId) -> u128 {
        self.st.get(id).map(|s| s.balance).unwrap_or(0)
    }
    fn listing(&self, id: u64) -> Listing {
        let get = |t| {
            self.st
                .get_contract_storage(&self.escrow, &item_listing_key(t, id))
        };
        Listing {
            seller: AccountId(get(TI_SELLER)),
            collection: AccountId(get(TI_COLL)),
            item: word_u(&get(TI_ITEM)) as u64,
            price: word_u(&get(TI_PRICE)),
            listed: word_u(&get(TI_LISTED)) as u64,
            remaining: word_u(&get(TI_REMAINING)) as u64,
            open: word_u(&get(TI_OPEN)) == 1,
            fills: word_u(&get(TI_FILLS)) as u64,
        }
    }
    fn fill(&self, id: u64, k: u64) -> (AccountId, u64) {
        let get = |t| {
            self.st
                .get_contract_storage(&self.escrow, &item_fill_key(t, id, k))
        };
        (
            AccountId(get(TI_FILL_BUYER)),
            word_u(&get(TI_FILL_QTY)) as u64,
        )
    }
    fn held(&self, item: u64) -> u128 {
        word_u(
            &self
                .st
                .get_contract_storage(&self.escrow, &item_held_key(1, item)),
        )
    }
    /// Read-only call through the VM (state reverted afterwards).
    fn read(&mut self, calldata: Vec<u8>) -> Vec<u8> {
        let e = self.escrow;
        let cp = self.st.checkpoint();
        let r = self.call(CAROL, e, calldata).expect("read");
        self.st.revert(cp);
        r.return_data
    }
}

const UNIT: u128 = B / 4;

// -- QA and build -----------------------------------------------------------

#[test]
fn quality_gate_allows_the_item_escrow_as_a_dapp() {
    use boing_qa::{check_contract_deploy_with_blocklist, QaResult};
    let code = item_escrow_bytecode(&OPERATOR);
    let r = check_contract_deploy_with_blocklist(&code, Some("dapp"), 24 * 1024, &[], true, false);
    assert!(matches!(r, QaResult::Allow | QaResult::Unsure), "{r:?}");
    assert!(code.len() < 24 * 1024, "fits the default bytecode cap");
}

#[test]
fn committed_item_bytecode_matches_the_builder() {
    let json = include_str!("../item-escrow.bytecode.json");
    let code = item_escrow_bytecode(&account_from_hex(OPERATOR_HEX));
    assert!(
        json.contains(&format!("\"0x{}\"", hex::encode(&code))),
        "run: cargo run --bin dump-escrow item > item-escrow.bytecode.json"
    );
}

#[test]
fn committed_item_abi_vectors_match_the_encoders() {
    assert_eq!(
        include_str!("../item-abi-vectors.json"),
        item_abi_vectors_json(),
        "run: cargo run --bin dump-escrow item-vectors > item-abi-vectors.json"
    );
}

// -- happy paths --------------------------------------------------------------

#[test]
fn list_moves_units_into_escrow_and_records_the_listing() {
    let mut w = World::new();
    let r = w.list(ALICE, VITALITY, 3, UNIT).expect("list");
    assert_eq!(w.units(&ALICE, VITALITY), 2);
    assert_eq!(w.units(&w.escrow.clone(), VITALITY), 3);
    assert_eq!(
        w.listing(1),
        Listing {
            seller: ALICE,
            collection: w.lpit,
            item: VITALITY,
            price: UNIT,
            listed: 3,
            remaining: 3,
            open: true,
            fills: 0
        }
    );
    assert_eq!(w.held(VITALITY), 3);
    assert!(r.logs.iter().any(|l| l.topics[0] == LOGI_LIST));
    // config: admin, fee bps, fee to, next id
    let cfg = w.read(encode_item_config());
    assert_eq!(&cfg[0..32], &OPERATOR.0);
    assert_eq!(word_u(&cfg[32..64]), 250);
    assert_eq!(&cfg[64..96], &OPERATOR.0);
    assert_eq!(word_u(&cfg[96..128]), 1);
}

#[test]
fn partial_buys_pay_seller_minus_fee_and_record_each_fill() {
    let mut w = World::new();
    w.list(ALICE, VITALITY, 5, UNIT).expect("list");
    let (a0, o0, b0) = (w.bal(&ALICE), w.bal(&OPERATOR), w.bal(&BOB));

    w.buy(BOB, 1, 2, 2 * UNIT).expect("buy 2");
    assert_eq!(w.units(&BOB, VITALITY), 2);
    let l = w.listing(1);
    assert_eq!((l.remaining, l.open, l.fills), (3, true, 1));
    assert_eq!(w.fill(1, 0), (BOB, 2));
    let total = 2 * UNIT;
    assert_eq!(w.bal(&ALICE) - a0, total - total * 250 / 10_000);
    assert_eq!(w.bal(&OPERATOR) - o0, total * 250 / 10_000);
    assert_eq!(b0 - w.bal(&BOB), total);

    w.buy(CAROL, 1, 3, 3 * UNIT).expect("buy rest");
    assert_eq!(w.units(&CAROL, VITALITY), 3);
    let l = w.listing(1);
    assert_eq!((l.remaining, l.open, l.fills, l.listed), (0, false, 2, 5));
    assert_eq!(w.fill(1, 1), (CAROL, 3));
    assert_eq!(w.units(&w.escrow.clone(), VITALITY), 0);
    assert_eq!(w.held(VITALITY), 0);
    assert_eq!(w.bal(&w.escrow.clone()), 0, "escrow keeps no BOING");
    // fill() read matches storage
    let f = w.read(encode_item_fill(1, 1));
    assert_eq!(&f[0..32], &CAROL.0);
    assert_eq!(word_u(&f[32..64]), 3);
    // closed: no more buys
    assert!(w.buy(BOB, 1, 1, UNIT).is_err());
}

#[test]
fn listing_read_returns_all_eight_words() {
    let mut w = World::new();
    w.list(ALICE, CALM, 2, 7 * UNIT).expect("list");
    let d = w.read(encode_item_listing(1));
    assert_eq!(d.len(), 256);
    assert_eq!(&d[0..32], &ALICE.0);
    assert_eq!(&d[32..64], &w.lpit.0);
    assert_eq!(word_u(&d[64..96]), CALM as u128);
    assert_eq!(word_u(&d[96..128]), 7 * UNIT);
    assert_eq!(word_u(&d[128..160]), 2);
    assert_eq!(word_u(&d[160..192]), 2);
    assert_eq!(word_u(&d[192..224]), 1);
    assert_eq!(word_u(&d[224..256]), 0);
    // an unknown id reads as zeros
    assert!(w.read(encode_item_listing(99)).iter().all(|b| *b == 0));
}

#[test]
fn cancel_by_seller_or_admin_returns_the_unsold_units() {
    let mut w = World::new();
    w.list(ALICE, VITALITY, 4, UNIT).expect("list");
    w.buy(BOB, 1, 1, UNIT).expect("buy 1");
    w.call(ALICE, w.escrow, encode_item_cancel(1))
        .expect("cancel");
    assert_eq!(w.units(&ALICE, VITALITY), 1 + 3);
    let l = w.listing(1);
    assert_eq!(
        (l.open, l.remaining, l.fills),
        (false, 3, 1),
        "remaining = units returned"
    );
    assert_eq!(w.held(VITALITY), 0);
    assert!(
        w.call(ALICE, w.escrow, encode_item_cancel(1)).is_err(),
        "already closed"
    );

    w.list(ALICE, VITALITY, 2, UNIT).expect("list 2");
    w.call(OPERATOR, w.escrow, encode_item_cancel(2))
        .expect("admin cancel");
    assert_eq!(
        w.units(&ALICE, VITALITY),
        4,
        "admin cancel returns to the seller"
    );
}

#[test]
fn several_listings_of_one_item_are_independent() {
    let mut w = World::new();
    w.list(ALICE, CALM, 2, UNIT).expect("alice");
    w.list(BOB, CALM, 3, 2 * UNIT).expect("bob");
    assert_eq!(w.held(CALM), 5);
    w.buy(CAROL, 2, 3, 6 * UNIT).expect("buy bob's");
    assert_eq!(w.units(&CAROL, CALM), 3);
    assert_eq!(w.listing(1).remaining, 2);
    w.call(ALICE, w.escrow, encode_item_cancel(1))
        .expect("cancel");
    assert_eq!(w.units(&ALICE, CALM), 3);
    assert_eq!(w.units(&w.escrow.clone(), CALM), 0);
}

// -- failures -------------------------------------------------------------------

#[test]
fn wrong_value_or_quantity_fails_and_refunds() {
    let mut w = World::new();
    w.list(ALICE, VITALITY, 2, UNIT).expect("list");
    let b0 = w.bal(&BOB);
    assert!(w.buy(BOB, 1, 1, UNIT - 1).is_err(), "underpay");
    assert!(w.buy(BOB, 1, 1, UNIT + 1).is_err(), "overpay");
    assert!(w.buy(BOB, 1, 3, 3 * UNIT).is_err(), "more than remaining");
    assert!(w.buy(BOB, 1, 0, 0).is_err(), "zero quantity");
    assert!(w.buy(BOB, 2, 1, UNIT).is_err(), "no such listing");
    assert_eq!(w.bal(&BOB), b0);
    assert_eq!(w.listing(1).remaining, 2);
}

#[test]
fn cannot_list_more_than_you_hold_or_list_without_transferring() {
    let mut w = World::new();
    assert!(w.list(ALICE, RATIONS, 3, UNIT).is_err(), "only holds 2");
    assert_eq!(w.units(&ALICE, RATIONS), 2, "batch reverted");
    let (c, e) = (w.lpit, w.escrow);
    // prepare + list without the transfer
    assert!(w
        .batch(
            ALICE,
            vec![
                (e, encode_item_prepare(&c, RATIONS)),
                (e, encode_item_list(&c, RATIONS, 1, UNIT))
            ]
        )
        .is_err());
    // transfer 1, claim 2
    assert!(w
        .batch(
            ALICE,
            vec![
                (e, encode_item_prepare(&c, RATIONS)),
                (c, encode_mt_transfer_calldata(&e, RATIONS, 1)),
                (e, encode_item_list(&c, RATIONS, 2, UNIT))
            ]
        )
        .is_err());
    // list a different item than prepared
    assert!(w
        .batch(
            ALICE,
            vec![
                (e, encode_item_prepare(&c, RATIONS)),
                (c, encode_mt_transfer_calldata(&e, VITALITY, 1)),
                (e, encode_item_list(&c, VITALITY, 1, UNIT))
            ]
        )
        .is_err());
    assert!(w.list(ALICE, RATIONS, 0, UNIT).is_err(), "zero qty");
    assert!(w.list(ALICE, RATIONS, 1, 0).is_err(), "zero price");
}

#[test]
fn stray_units_cannot_be_listed_by_anyone_and_admin_rescues_only_those() {
    let mut w = World::new();
    let (c, e) = (w.lpit, w.escrow);
    // Alice sends 2 Vitality to the escrow without listing.
    w.call(ALICE, c, encode_mt_transfer_calldata(&e, VITALITY, 2))
        .expect("stray");
    // Mallory tries to list them without sending any.
    assert!(w
        .batch(
            MALLORY,
            vec![
                (e, encode_item_prepare(&c, VITALITY)),
                (e, encode_item_list(&c, VITALITY, 2, UNIT))
            ]
        )
        .is_err());
    // Mallory prepares, then lists in a separate transaction.
    w.call(MALLORY, e, encode_item_prepare(&c, VITALITY))
        .expect("prepare alone");
    assert!(w
        .call(MALLORY, e, encode_item_list(&c, VITALITY, 2, UNIT))
        .is_err());
    // A real listing next to the stray units.
    w.list(ALICE, VITALITY, 1, UNIT).expect("list");
    assert!(
        w.call(OPERATOR, e, encode_item_rescue(&c, VITALITY, 3, &ALICE))
            .is_err(),
        "cannot touch listed units"
    );
    assert!(
        w.call(MALLORY, e, encode_item_rescue(&c, VITALITY, 2, &MALLORY))
            .is_err(),
        "admin only"
    );
    w.call(OPERATOR, e, encode_item_rescue(&c, VITALITY, 2, &ALICE))
        .expect("rescue");
    assert_eq!(w.units(&ALICE, VITALITY), 5 - 2 - 1 + 2);
    assert_eq!(w.units(&e, VITALITY), 1);
    w.buy(BOB, 1, 1, UNIT).expect("listing still fills");
}

#[test]
fn cancel_by_a_stranger_fails() {
    let mut w = World::new();
    w.list(ALICE, VITALITY, 1, UNIT).expect("list");
    assert!(w.call(MALLORY, w.escrow, encode_item_cancel(1)).is_err());
    assert!(w.listing(1).open);
}

#[test]
fn value_is_rejected_on_everything_but_buy() {
    let mut w = World::new();
    let (c, e) = (w.lpit, w.escrow);
    w.list(ALICE, VITALITY, 1, UNIT).expect("list");
    assert!(w.call_value(ALICE, e, encode_item_cancel(1), 1).is_err());
    assert!(w
        .call_value(ALICE, e, encode_item_prepare(&c, VITALITY), 1)
        .is_err());
    assert!(w.call_value(CAROL, e, encode_item_config(), 1).is_err());
}

#[test]
fn allow_list_gates_new_listings_and_reports_held() {
    let mut w = World::new();
    let (c, e) = (w.lpit, w.escrow);
    w.list(ALICE, VITALITY, 2, UNIT).expect("list");
    let h = w.read(encode_item_held(&c, VITALITY));
    assert_eq!((word_u(&h[0..32]), word_u(&h[32..64])), (1, 2));
    assert!(w
        .call(MALLORY, e, encode_item_set_collection(&c, false))
        .is_err());
    w.call(OPERATOR, e, encode_item_set_collection(&c, false))
        .expect("disallow");
    assert!(w.list(ALICE, VITALITY, 1, UNIT).is_err());
    // open listings still settle
    w.buy(BOB, 1, 1, UNIT).expect("buy");
    w.call(ALICE, e, encode_item_cancel(1)).expect("cancel");
    w.call(OPERATOR, e, encode_item_set_collection(&c, true))
        .expect("allow again");
    w.list(ALICE, VITALITY, 1, UNIT).expect("list again");
    assert_eq!(w.held(VITALITY), 1, "same collection index after re-allow");
}

#[test]
fn unknown_collection_is_refused() {
    let mut w = World::new();
    let e = w.escrow;
    let other = AccountId([0x77; 32]);
    assert!(w.call(ALICE, e, encode_item_prepare(&other, 1)).is_err());
}

#[test]
fn fee_math_rounds_down_and_never_loses_wei() {
    let mut w = World::new();
    let unit: u128 = 13; // 3 * 13 = 39 wei total; fee floor(39 * 250 / 10000) = 0
    w.list(ALICE, VITALITY, 3, unit).expect("list");
    let (a0, o0) = (w.bal(&ALICE), w.bal(&OPERATOR));
    w.buy(BOB, 1, 3, 39).expect("buy");
    assert_eq!(w.bal(&ALICE) - a0, 39);
    assert_eq!(w.bal(&OPERATOR), o0);
    let unit: u128 = 1_234_567_891;
    w.list(ALICE, VITALITY, 2, unit).expect("list");
    let (a0, o0) = (w.bal(&ALICE), w.bal(&OPERATOR));
    w.buy(BOB, 2, 2, 2 * unit).expect("buy");
    let (fee, seller) = split_price(2 * unit, DEFAULT_FEE_BPS);
    assert_eq!(w.bal(&ALICE) - a0, seller);
    assert_eq!(w.bal(&OPERATOR) - o0, fee);
}

#[test]
fn set_fee_and_set_admin_are_admin_only() {
    let mut w = World::new();
    let e = w.escrow;
    assert!(w
        .call(MALLORY, e, encode_item_set_fee(100, &MALLORY))
        .is_err());
    assert!(w
        .call(OPERATOR, e, encode_item_set_fee(1_001, &CAROL))
        .is_err());
    assert!(w
        .call(OPERATOR, e, encode_item_set_fee(100, &ZERO))
        .is_err());
    w.call(OPERATOR, e, encode_item_set_fee(1_000, &CAROL))
        .expect("fee");
    w.list(ALICE, VITALITY, 1, B).expect("list");
    let c0 = w.bal(&CAROL);
    w.buy(BOB, 1, 1, B).expect("buy");
    assert_eq!(w.bal(&CAROL) - c0, B / 10);

    assert!(w.call(MALLORY, e, encode_item_set_admin(&MALLORY)).is_err());
    w.call(OPERATOR, e, encode_item_set_admin(&CAROL))
        .expect("hand over");
    assert!(w.call(OPERATOR, e, encode_item_set_fee(0, &CAROL)).is_err());
    w.call(CAROL, e, encode_item_set_fee(0, &CAROL))
        .expect("new admin");
}

// -- gas ------------------------------------------------------------------------------

#[test]
fn gas_report() {
    let mut w = World::new();
    let list = w.list(ALICE, VITALITY, 5, UNIT).expect("list").gas_used;
    let buy = w.buy(BOB, 1, 2, 2 * UNIT).expect("buy").gas_used;
    let buy_last = w.buy(CAROL, 1, 3, 3 * UNIT).expect("buy last").gas_used;
    w.list(ALICE, CALM, 2, UNIT).expect("list 2");
    let cancel = w
        .call(ALICE, w.escrow, encode_item_cancel(2))
        .expect("cancel")
        .gas_used;
    let bytes = item_escrow_bytecode(&OPERATOR).len();
    let carol_nonce = w.st.get(&CAROL).map(|s| s.nonce).unwrap_or(0);
    let deploy_gas = w
        .send(CAROL, deploy(item_escrow_bytecode(&CAROL), "dapp"))
        .expect("deploy")
        .gas_used;
    let allow = w
        .call(
            CAROL,
            nonce_derived_contract_address(&CAROL, carol_nonce),
            encode_item_set_collection(&w.lpit.clone(), true),
        )
        .expect("allow")
        .gas_used;
    println!("item escrow bytes={bytes} gas: deploy={deploy_gas} set_collection={allow} list(batch)={list} buy={buy} buy_last={buy_last} cancel={cancel}");
}
