/**
 * Education trades migration: fee-inclusive -> fee-exclusive
 * profitLoss = (sellPrice - buyPrice) x quantity  (no fee deduction)
 *
 * Run from Investment-InfoStack directory:
 *   node --env-file=.env.local .claude/worktrees/filter-design-unify/migrate-education-trades.mjs
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  const { data: row, error } = await supabase
    .from("app_data")
    .select("data")
    .eq("key", "education_account")
    .maybeSingle();

  if (error || !row) {
    console.error("Read failed:", error?.message ?? "no row");
    process.exit(1);
  }

  const accountData = row.data;
  const trades = accountData.trades ?? [];

  console.log(`\nTotal ${trades.length} trades\n`);

  let changedCount = 0;

  const updatedTrades = trades.map((t, i) => {
    const buyAmount = t.buyPrice * t.quantity;
    const newProfitLoss = Math.round((t.sellPrice - t.buyPrice) * t.quantity);
    const newProfitLossPct = buyAmount > 0
      ? Math.round((newProfitLoss / buyAmount) * 1000000) / 10000
      : 0;
    const newResult = newProfitLoss > 0 ? "Win" : "Lose";
    const diff = newProfitLoss - t.profitLoss;
    if (diff !== 0) changedCount++;

    console.log(`[${i + 1}] ${t.stockCode} (${t.buyDate} ~ ${t.sellDate})`);
    console.log(`    Old PL: ${t.profitLoss}  ->  New PL: ${newProfitLoss}  (diff: ${diff >= 0 ? "+" : ""}${diff})`);
    console.log(`    Old %:  ${t.profitLossPct}  ->  New %:  ${newProfitLossPct}`);
    console.log();

    return { ...t, profitLoss: newProfitLoss, profitLossPct: newProfitLossPct, result: newResult };
  });

  console.log(`Changed: ${changedCount} / Total: ${trades.length}`);

  if (changedCount === 0) {
    console.log("Nothing to update.");
    return;
  }

  const { error: writeError } = await supabase.from("app_data").upsert(
    { key: "education_account", data: { ...accountData, trades: updatedTrades }, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  if (writeError) {
    console.error("Write failed:", writeError.message);
    process.exit(1);
  }

  console.log("\nDone. Supabase updated.");
}

migrate().catch((e) => { console.error(e); process.exit(1); });
