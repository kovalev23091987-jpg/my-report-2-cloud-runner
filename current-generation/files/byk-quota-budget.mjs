export const BYK_OFFICIAL_MONTHLY_QUOTA = 15_000;
export const BYK_OPERATIONAL_MONTHLY_CAP = 13_500;
export const BYK_SCHEDULED_MONTHLY_CAP = 12_900;
export const BYK_MAX_REQUESTS_PER_DEEP_CHECK = 5;

export function utcMonthKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 7);
}

export function evaluateBykQuotaAdmission({ source, units, used_total = 0, used_scheduled = 0 } = {}) {
  const runSource = source === "schedule" ? "schedule" : "manual";
  const amount = Number(units);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > BYK_MAX_REQUESTS_PER_DEEP_CHECK) {
    return { allowed: false, status: "INVALID_REQUEST_UNITS", source: runSource };
  }
  if (Number(used_total) + amount > BYK_OPERATIONAL_MONTHLY_CAP) {
    return { allowed: false, status: "OPERATIONAL_MONTHLY_CAP_EXHAUSTED", source: runSource };
  }
  if (runSource === "schedule" && Number(used_scheduled) + amount > BYK_SCHEDULED_MONTHLY_CAP) {
    return { allowed: false, status: "SCHEDULED_MONTHLY_CAP_EXHAUSTED", source: runSource };
  }
  return { allowed: true, status: "ADMITTED", source: runSource };
}

export async function installBykQuotaLedger(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS report2_byk_monthly_usage(
      month_key TEXT PRIMARY KEY,
      official_quota INTEGER NOT NULL CHECK(official_quota=15000),
      operational_cap INTEGER NOT NULL CHECK(operational_cap=13500),
      scheduled_cap INTEGER NOT NULL CHECK(scheduled_cap=12900),
      used_total INTEGER NOT NULL DEFAULT 0 CHECK(used_total>=0),
      used_scheduled INTEGER NOT NULL DEFAULT 0 CHECK(used_scheduled>=0),
      used_manual INTEGER NOT NULL DEFAULT 0 CHECK(used_manual>=0),
      version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
      last_reservation_id TEXT,
      updated_ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report2_byk_reservations(
      reservation_id TEXT PRIMARY KEY,
      month_key TEXT NOT NULL,
      run_source TEXT NOT NULL CHECK(run_source IN ('schedule','manual')),
      contract_code TEXT NOT NULL,
      reserved_units INTEGER NOT NULL CHECK(reserved_units>0 AND reserved_units<=5),
      created_ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_report2_byk_reservations_month ON report2_byk_reservations(month_key,created_ts);
  `);
}

export function makeBykReserve(db, { source, clock = Date.now } = {}) {
  const runSource = source === "schedule" ? "schedule" : "manual";
  return async ({ contract, run_id, units } = {}) => {
    const amount = Number(units);
    const localAdmission = evaluateBykQuotaAdmission({ source: runSource, units: amount });
    if (!localAdmission.allowed) return { ...localAdmission, reserved_units: 0 };
    const now = clock();
    const month = utcMonthKey(now);
    const id = `BYK:${month}:${runSource}:${String(run_id || "").trim()}:${String(contract || "").trim()}`;
    await db.batch([
      db.prepare(`INSERT INTO report2_byk_monthly_usage(month_key,official_quota,operational_cap,scheduled_cap,used_total,used_scheduled,used_manual,version,last_reservation_id,updated_ts)
        VALUES(?1,?2,?3,?4,0,0,0,0,NULL,?5) ON CONFLICT(month_key) DO NOTHING`).bind(month, BYK_OFFICIAL_MONTHLY_QUOTA, BYK_OPERATIONAL_MONTHLY_CAP, BYK_SCHEDULED_MONTHLY_CAP, now),
      db.prepare(`UPDATE report2_byk_monthly_usage SET used_total=used_total+?1,
        used_scheduled=used_scheduled+CASE WHEN ?2='schedule' THEN ?1 ELSE 0 END,
        used_manual=used_manual+CASE WHEN ?2='manual' THEN ?1 ELSE 0 END,
        version=version+1,last_reservation_id=?3,updated_ts=?4
        WHERE month_key=?5 AND official_quota=?6 AND operational_cap=?7 AND scheduled_cap=?8
          AND used_total+?1<=operational_cap
          AND (?2='manual' OR used_scheduled+?1<=scheduled_cap)
          AND NOT EXISTS(SELECT 1 FROM report2_byk_reservations WHERE reservation_id=?3)`).bind(amount, runSource, id, now, month, BYK_OFFICIAL_MONTHLY_QUOTA, BYK_OPERATIONAL_MONTHLY_CAP, BYK_SCHEDULED_MONTHLY_CAP),
      db.prepare(`INSERT INTO report2_byk_reservations(reservation_id,month_key,run_source,contract_code,reserved_units,created_ts)
        SELECT ?1,?2,?3,?4,?5,?6 FROM report2_byk_monthly_usage
        WHERE month_key=?2 AND last_reservation_id=?1 ON CONFLICT(reservation_id) DO NOTHING`).bind(id, month, runSource, String(contract || ""), amount, now),
    ]);
    const reservation = await db.prepare(`SELECT reserved_units FROM report2_byk_reservations WHERE reservation_id=?1`).bind(id).first();
    const usage = await db.prepare(`SELECT used_total,used_scheduled,used_manual,operational_cap,scheduled_cap,official_quota FROM report2_byk_monthly_usage WHERE month_key=?1`).bind(month).first();
    const allowed = Number(reservation?.reserved_units) === amount;
    return { allowed, status: allowed ? "RESERVED" : "MONTHLY_QUOTA_RESERVED_OR_EXHAUSTED", reserved_units: allowed ? amount : 0, reservation_id: id, month_key: month, usage };
  };
}
