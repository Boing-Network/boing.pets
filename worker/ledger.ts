/** Atomic Boinglets/Sparkles balances kept in sync with the ledger audit trail. */
export type Currency = "boinglets" | "sparkles";

export async function balanceOf(
  env: Env,
  owner: string,
  currency: Currency,
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT balance FROM account_balances WHERE owner=? AND currency=?",
  )
    .bind(owner, currency)
    .first<{ balance: number }>();
  if (row) return Number(row.balance || 0);
  const legacy = await env.DB.prepare(
    "SELECT COALESCE(SUM(delta),0) AS bal FROM ledger WHERE owner=? AND currency=?",
  )
    .bind(owner, currency)
    .first<{ bal: number }>();
  return Number(legacy?.bal || 0);
}

export function ensureBalanceStmt(
  env: Env,
  owner: string,
  currency: Currency,
): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO account_balances(owner,currency,balance) VALUES(?,?,0) ON CONFLICT(owner,currency) DO NOTHING",
  ).bind(owner, currency);
}

export function creditBalanceStmt(
  env: Env,
  owner: string,
  currency: Currency,
  amount: number,
): D1PreparedStatement {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("Invalid credit amount");
  return env.DB.prepare(
    `INSERT INTO account_balances(owner,currency,balance) VALUES(?,?,?)
     ON CONFLICT(owner,currency) DO UPDATE SET balance = balance + excluded.balance`,
  ).bind(owner, currency, amount);
}

export function debitBalanceStmt(
  env: Env,
  owner: string,
  currency: Currency,
  amount: number,
): D1PreparedStatement {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid debit amount");
  return env.DB.prepare(
    `UPDATE account_balances
     SET balance = CASE WHEN balance >= ? THEN balance - ? ELSE NULL END
     WHERE owner=? AND currency=?`,
  ).bind(amount, amount, owner, currency);
}

export function ledgerInsertStmt(
  env: Env,
  id: string,
  owner: string,
  currency: Currency,
  delta: number,
  reason: string,
  ref: string | null,
  createdAt: number,
): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO ledger(id,owner,currency,delta,reason,ref,created_at) VALUES(?,?,?,?,?,?,?)",
  ).bind(id, owner, currency, delta, reason, ref, createdAt);
}

export function pushLedgerCredit(
  statements: D1PreparedStatement[],
  env: Env,
  id: string,
  owner: string,
  currency: Currency,
  amount: number,
  reason: string,
  ref: string | null,
  createdAt: number,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid credit amount");
  statements.push(
    ledgerInsertStmt(env, id, owner, currency, amount, reason, ref, createdAt),
    creditBalanceStmt(env, owner, currency, amount),
  );
}

export function pushLedgerDebit(
  statements: D1PreparedStatement[],
  env: Env,
  id: string,
  owner: string,
  currency: Currency,
  amount: number,
  reason: string,
  ref: string | null,
  createdAt: number,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid debit amount");
  statements.push(
    ensureBalanceStmt(env, owner, currency),
    debitBalanceStmt(env, owner, currency, amount),
    ledgerInsertStmt(env, id, owner, currency, -amount, reason, ref, createdAt),
  );
}

export function ledgerCreditPair(
  env: Env,
  id: string,
  owner: string,
  currency: Currency,
  amount: number,
  reason: string,
  ref: string | null,
  createdAt: number,
): D1PreparedStatement[] {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid credit amount");
  return [
    ledgerInsertStmt(env, id, owner, currency, amount, reason, ref, createdAt),
    creditBalanceStmt(env, owner, currency, amount),
  ];
}
