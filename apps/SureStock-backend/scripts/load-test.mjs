#!/usr/bin/env node
/**
 * T-32: "300 sales an hour sustained with response times inside
 * target." Grounded in Doc 2's own performance-targets table (§6):
 * "the sale write completes in under 300ms server-side... product
 * search returns in under 150ms on a 5,000-SKU catalogue."
 *
 * A hand-rolled script, not a dedicated load-testing library — 300
 * sales/hour is one every 12 seconds on average, real concurrency at
 * peak but well within what a small Node script can drive and measure
 * without needing a tool built for raw HTTP throughput ceiling-finding.
 * Registers a real, isolated shop via T-30's own signup endpoint (no
 * shared fixture to pollute or collide with), sells one real product
 * repeatedly at the target rate for the requested duration, and reports
 * p50/p95/max sale-write latency against the 300ms target — plus a
 * product-search latency sample, honestly caveated: this dev database
 * doesn't hold anywhere near the 5,000-SKU catalogue that target is
 * defined against, so a passing number here isn't proof of that SLA,
 * just a real data point at whatever scale actually exists right now.
 *
 * Usage:
 *   node scripts/load-test.mjs [--duration-minutes=N] [--rate-per-hour=N] [--base-url=http://localhost:4000]
 *
 * Defaults to a short, honest demonstration run (2 minutes at 300/hour
 * = 10 sales) rather than silently claiming a full hour ran when it
 * didn't. Pass --duration-minutes=60 for the real, full sustained check
 * before an actual launch.
 */

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? true];
    }),
  );
  return {
    durationMinutes: Number(args['duration-minutes'] ?? 2),
    ratePerHour: Number(args['rate-per-hour'] ?? 300),
    baseUrl: args['base-url'] ?? 'http://localhost:4000',
  };
}

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

async function jsonFetch(url, options) {
  const start = performance.now();
  const res = await fetch(url, options);
  const elapsedMs = performance.now() - start;
  const body = await res.json().catch(() => ({}));
  return { res, body, elapsedMs };
}

async function main() {
  const { durationMinutes, ratePerHour, baseUrl } = parseArgs();
  const intervalMs = 3_600_000 / ratePerHour;
  const totalSales = Math.max(1, Math.round((durationMinutes * 60_000) / intervalMs));

  console.log(`SureStock load check (T-32)`);
  console.log(`Target: ${ratePerHour} sales/hour (one every ${(intervalMs / 1000).toFixed(1)}s), for ${durationMinutes} minute(s) — ${totalSales} sales total.`);
  if (durationMinutes < 60) {
    console.log(`Note: this is a short demonstration run, not the full hour T-32 asks for — pass --duration-minutes=60 to run the real thing.`);
  }
  console.log('');

  // A real, isolated shop via the actual T-30 signup endpoint — never touches an existing shop's data.
  const email = `load-test-${Date.now()}@test.surestock.local`;
  const register = await jsonFetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopName: 'Load Test Shop', ownerName: 'Load Test Owner', email, password: 'load-test-password-123' }),
  });
  if (!register.res.ok) throw new Error(`Failed to register load-test shop: ${register.res.status} ${JSON.stringify(register.body)}`);
  const token = register.body.accessToken;
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const product = await jsonFetch(`${baseUrl}/products`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Load Test Widget', variants: [{ sku: `LOAD-${Date.now()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: totalSales + 10 }] }),
  });
  const variantId = product.body.variants[0].id;

  await jsonFetch(`${baseUrl}/till-shifts`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ openingFloat: 0 }) });

  // One product-search sample, for the 150ms target — see the doc
  // comment above on why this dev catalogue's size makes it a real
  // measurement, not proof of the 5,000-SKU SLA specifically.
  const search = await jsonFetch(`${baseUrl}/products?q=Load&limit=20`, { headers: authHeaders });
  console.log(`Product search sample: ${search.elapsedMs.toFixed(1)}ms (target: <150ms @ 5,000 SKUs — this catalogue is much smaller, so this is a floor, not proof of that SLA)`);
  console.log('');

  const saleLatenciesMs = [];
  let failures = 0;

  for (let i = 0; i < totalSales; i++) {
    const start = performance.now();
    const sale = await jsonFetch(`${baseUrl}/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ id: crypto.randomUUID(), lines: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] }),
    });
    if (!sale.res.ok) failures++;
    saleLatenciesMs.push(sale.elapsedMs);

    process.stdout.write(`\rSale ${i + 1}/${totalSales} — ${sale.elapsedMs.toFixed(0)}ms${sale.res.ok ? '' : ' (FAILED)'}   `);

    const elapsedThisIteration = performance.now() - start;
    const remainingWait = intervalMs - elapsedThisIteration;
    if (remainingWait > 0 && i < totalSales - 1) await new Promise((r) => setTimeout(r, remainingWait));
  }
  console.log('\n');

  const sorted = [...saleLatenciesMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1];

  console.log(`Sale write latency — p50: ${p50.toFixed(1)}ms, p95: ${p95.toFixed(1)}ms, max: ${max.toFixed(1)}ms (target: <300ms server-side)`);
  console.log(`Failures: ${failures}/${totalSales}`);

  const passed = p95 < 300 && failures === 0;
  console.log('');
  console.log(passed ? '✅ PASS — response times inside target, no failures.' : '❌ FAIL — see above.');
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Load test errored:', err);
  process.exit(1);
});
