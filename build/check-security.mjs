// Fixture checks for GoPlus parsing: home-chain choice and risk flags (no network).
// Run: node build/check-security.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { pickContract, evmFlags, solanaFlags } from "../site/goplus.js";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

check("the token's home chain is checked, not a bridged copy (ARB lives on Arbitrum)", () => {
  const arb = { homeChain: "arbitrum-one", contracts: { ethereum: "0xb507", "arbitrum-one": "0x912c" } };
  assert.deepEqual(pickContract(arb), { chain: "arbitrum-one", address: "0x912c", home: true });
});
check("unsupported home chain falls back to the first supported one, flagged as not home", () => {
  assert.deepEqual(pickContract({ homeChain: "hydration", contracts: { hydration: "x", ethereum: "0xaa" } }), { chain: "ethereum", address: "0xaa", home: false });
  assert.equal(pickContract({ contracts: {} }), null);
});
check("EVM flags: owner powers, tax, proxy and unverified source; absent fields are not flags", () => {
  assert.deepEqual(evmFlags({ is_proxy: "1", buy_tax: "0", sell_tax: "0", is_honeypot: "0", is_open_source: "1" }), ["Upgradeable (proxy) contract"]);
  const bad = evmFlags({ is_honeypot: "1", is_mintable: "1", owner_change_balance: "1", buy_tax: "0.05", sell_tax: "0.1", is_open_source: "0" });
  assert.deepEqual(bad, ["Honeypot (cannot sell)", "Owner can mint", "Owner can change balances", "Trading tax 5% buy / 10% sell", "Source code not verified"]);
});
check("Solana flags: active mint and freeze authorities", () => {
  assert.deepEqual(solanaFlags({ mintable: { status: "0" }, freezable: { status: "0" }, transfer_fee: {} }), []);
  assert.deepEqual(solanaFlags({ mintable: { status: "1" }, freezable: { status: "1" } }), ["Mint authority active", "Freeze authority active"]);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
