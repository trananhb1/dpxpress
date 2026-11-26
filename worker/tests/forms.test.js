import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { handle, DRIVER, COURIER } from "../src/forms.js";
const courier = ({ request, env }) => worker.fetch(request, env);
const driver = courier;

const post = (path, fields) => new Request(`http://localhost${path}`, { method: "POST", body: new URLSearchParams(fields) });

const goodDriver = {
  name: "Test Person", email: "test@example.com", phone: "0400 000 000", suburb: "Testville",
  own_vehicle: "yes", vehicle_type: "van-1t", licence: "LR", abn: "yes",
  availability: "flexible", experience: "1-3", message: "", consent: "yes", hp_check: "",
};
const goodCourier = {
  company: "Test Co", contact: "Test Person", email: "ops@example.com", phone: "(02) 0000 0000",
  areas: "Testville", volume: "5 runs", vehicle: "van-2t", start_date: "2027-01-15", hp_check: "",
};

const configured = { FORM_TO_EMAIL: "a@example.com", FORM_FROM_EMAIL: "b@example.com", SEND_EMAIL: {} };

test("honeypot filled: looks like success, sends nothing", async () => {
  const sent = [];
  const res = await handle({ request: post("/api/driver", { ...goodDriver, hp_check: "http://spam" }), env: configured }, DRIVER, async (...a) => sent.push(a));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/thanks.html");
  assert.equal(sent.length, 0);
});

test("configured and valid: sends once, then 303 to thanks", async () => {
  const sent = [];
  const res = await handle({ request: post("/api/courier", goodCourier), env: configured }, COURIER, async (env, schema, data) => sent.push(data));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/thanks.html");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].company, "Test Co");
});

test("send failure is a 502, not a success", async () => {
  const res = await handle({ request: post("/api/courier", goodCourier), env: configured }, COURIER, async () => { throw new Error("boom"); });
  assert.equal(res.status, 502);
});

test("missing consent is a 400", async () => {
  const { consent, ...noConsent } = goodDriver;
  const res = await driver({ request: post("/api/driver", noConsent), env: {} });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Consent is required/);
});

test("select values outside the whitelist are a 400", async () => {
  const res = await driver({ request: post("/api/driver", { ...goodDriver, licence: "<script>" }), env: {} });
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.match(body, /Licence class has an invalid value/);
  assert.doesNotMatch(body, /<script>/);
});

test("bad email and phone are a 400", async () => {
  const res = await courier({ request: post("/api/courier", { ...goodCourier, email: "x\r\nBcc: evil@example.com", phone: "12" }), env: {} });
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.match(body, /Email does not look/);
  assert.match(body, /Phone does not look/);
});

test("oversized body is a 413", async () => {
  const res = await courier({ request: post("/api/courier", { ...goodCourier, message: "x".repeat(40000) }), env: {} });
  assert.equal(res.status, 413);
});

test("valid data with sending unconfigured is a 503, never a fake success", async () => {
  for (const [fn, path, data] of [[courier, "/api/courier", goodCourier], [driver, "/api/driver", goodDriver]]) {
    const res = await fn({ request: post(path, data), env: {} });
    assert.equal(res.status, 503, path);
    assert.match(await res.text(), /not connected yet/);
  }
});

test("unknown path is 404 and GET is 405", async () => {
  assert.equal((await worker.fetch(new Request("http://localhost/api/nope", { method: "POST" }), {})).status, 404);
  assert.equal((await worker.fetch(new Request("http://localhost/api/driver"), {})).status, 405);
});
