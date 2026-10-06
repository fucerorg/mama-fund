// Pruebas de las reglas de saldos de MamaFund.
// Correr con: node --test tests/
//
// index.html no tiene módulos: extraemos las funciones puras por nombre desde
// el <script> principal y las evaluamos con un CONFIG/state mínimos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`No encontré function ${name}`);
  let i = html.indexOf("{", start), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    if (html[i] === "}" && --depth === 0) break;
  }
  return html.slice(start, i + 1);
}

const FUNCS = ["aportanteOf", "computeBalances", "sortedBalances", "txEffects", "ledgerFor", "txTime", "txDay", "sortTxs"];
const lib = new Function(`
  const CONFIG = { SIBLINGS: ["Fede", "Mery", "Vero"] };
  const state = { transactions: [] };
  ${FUNCS.map(extractFunction).join("\n")}
  return { ${FUNCS.join(", ")}, state };
`)();

const SIBS = ["Fede", "Mery", "Vero"];

test("escenario completo: transferencias, devolución, gastos y aportes", () => {
  const txs = [
    { type: "income",   amount: 1000, recipient: "", description: "Jubilación" },
    { type: "transfer", amount: 300,  paidBy: "Mamá", recipient: "Mery" },
    { type: "transfer", amount: 100,  paidBy: "Mery", recipient: "Vero" },
    { type: "transfer", amount: 50,   paidBy: "Vero", recipient: "Mamá" },
    { type: "expense",  amount: 20,   paidBy: "Vero" },
    { type: "income",   amount: 200,  recipient: "", description: "Aporte Fede" },
    { type: "income",   amount: 70,   recipient: "", paidBy: "Mery", description: "Mi aporte" },
  ];
  const r = lib.computeBalances(txs);
  assert.equal(r.mamaBalance, 1020);
  assert.equal(r.totalTransfers, 300);
  assert.equal(r.sib.Fede.aportes, 200);
  assert.equal(r.sib.Mery.aportes, 70);
  const net = Object.fromEntries(lib.sortedBalances(txs).map(b => [b.name, b.net]));
  assert.deepEqual(net, { Mery: 200, Vero: 30, Fede: 0 });
});

test("transferencia entre hermanos no cambia la cuenta de mamá ni el total", () => {
  const base = [{ type: "transfer", amount: 500, paidBy: "Mamá", recipient: "Vero" }];
  const withHandoff = [...base, { type: "transfer", amount: 200, paidBy: "Vero", recipient: "Mery" }];
  const a = lib.computeBalances(base), b = lib.computeBalances(withHandoff);
  assert.equal(b.mamaBalance, a.mamaBalance);
  const total = txs => lib.sortedBalances(txs).reduce((s, x) => s + x.net, 0);
  assert.equal(total(withHandoff), total(base));
});

// Datos aleatorios (con semilla fija) para comparar las dos implementaciones.
function randomTxs(n, seed) {
  let x = seed;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const people = ["Mamá", ...SIBS];
  const txs = [];
  for (let i = 0; i < n; i++) {
    const amount = Math.round(rnd() * 100000) + 1;
    const date = `2026-${String(1 + Math.floor(rnd() * 9)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`;
    const kind = pick(["income", "income", "expense", "expense", "mother_expense", "transfer", "transfer"]);
    if (kind === "income") txs.push({ type: "income", amount, date, recipient: pick(["", "", ...SIBS]) });
    if (kind === "expense") txs.push({ type: "expense", amount, date, paidBy: pick(SIBS) });
    if (kind === "mother_expense") txs.push({ type: "mother_expense", amount, date });
    if (kind === "transfer") {
      const from = pick(people);
      const to = pick(people.filter(p => p !== from));
      txs.push({ type: "transfer", amount, date, paidBy: from, recipient: to });
    }
  }
  return lib.sortTxs(txs);
}

test("el estado de cuenta termina en el mismo saldo que el resumen", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const txs = randomTxs(300, seed);
    const r = lib.computeBalances(txs);
    const last = name => (lib.ledgerFor(name, txs)[0]?.balance) ?? 0;
    for (const b of lib.sortedBalances(txs)) assert.equal(last(b.name), b.net, `${b.name} seed ${seed}`);
    assert.equal(last("Mamá"), r.mamaBalance, `Mamá seed ${seed}`);
    // Lo que está en la cuenta de mamá + en manos de hermanos = ingresos − gastos.
    const enManos = lib.sortedBalances(txs).reduce((s, x) => s + x.net, 0);
    assert.equal(r.mamaBalance + enManos, r.systemBalance, `total seed ${seed}`);
  }
});

test("historial: mismo día ordenado por hora de carga (la última arriba)", () => {
  const txs = lib.sortTxs([
    { id: "a", date: "2026-10-01", timestamp: "2026-10-01T09:00:00.000Z" },
    { id: "b", date: "2026-10-02", timestamp: "2026-10-02T08:00:00.000Z" },
    { id: "c", date: "2026-10-01", timestamp: "2026-10-01T15:30:00.000Z" },
    { id: "d", date: "2026-10-01", timestamp: "2026-10-01T11:00:00.000Z" },
  ]);
  assert.deepEqual(txs.map(t => t.id), ["b", "c", "d", "a"]);
});

test("aportante: paidBy o 'Aporte <Nombre>' en la descripción", () => {
  assert.equal(lib.aportanteOf({ paidBy: "Vero" }), "Vero");
  assert.equal(lib.aportanteOf({ description: "Aporte Mery" }), "Mery");
  assert.equal(lib.aportanteOf({ description: "aporte fede octubre" }), "Fede");
  assert.equal(lib.aportanteOf({ description: "Jubilación" }), "");
});
