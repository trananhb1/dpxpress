// Server-side form handling, used by src/index.js (the Worker).
//
// Sending is deliberately NOT configured. Until FORM_TO_EMAIL, FORM_FROM_EMAIL and the
// SEND_EMAIL binding exist, every valid submission gets a 503 "not connected yet" page,
// never a fake success. See README.md.

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
// Australian numbers: 8-12 digits once spaces, brackets, dashes and a leading +61 are removed.
const PHONE_RE = /^[0-9 +()\-]{8,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const COURIER = {
  name: "courier enquiry",
  back: "/for-couriers.html",
  fields: {
    company: { label: "Company name", required: true, max: 120 },
    contact: { label: "Contact name", required: true, max: 120 },
    email: { label: "Email", required: true, max: 200, type: "email" },
    phone: { label: "Phone", required: true, max: 20, type: "phone" },
    areas: { label: "Areas or suburbs", required: true, max: 300 },
    volume: { label: "Runs per week", required: true, max: 120 },
    vehicle: { label: "Vehicle type needed", required: true, oneOf: ["car", "van-1t", "van-2t", "truck-3t", "mixed", "unsure"] },
    start_date: { label: "Start date", max: 10, type: "date" },
    message: { label: "Anything else", max: 3000 },
  },
};

export const DRIVER = {
  name: "driver application",
  back: "/drive-with-us.html",
  fields: {
    name: { label: "Full name", required: true, max: 120 },
    email: { label: "Email", required: true, max: 200, type: "email" },
    phone: { label: "Phone", required: true, max: 20, type: "phone" },
    suburb: { label: "Suburb", required: true, max: 120 },
    own_vehicle: { label: "Own vehicle", required: true, oneOf: ["yes", "no"] },
    vehicle_type: { label: "Vehicle type", oneOf: ["car", "ute", "van-small", "van-1t", "van-2t", "truck-3t", "none"] },
    licence: { label: "Licence class", required: true, oneOf: ["C", "LR", "MR", "HR", "HC", "MC", "provisional"] },
    abn: { label: "ABN", required: true, oneOf: ["yes", "no"] },
    availability: { label: "Availability", required: true, oneOf: ["full-time", "part-time", "weekends", "peak", "flexible"] },
    experience: { label: "Experience", required: true, oneOf: ["none", "under-1", "1-3", "over-3"] },
    message: { label: "Tell us about yourself", max: 3000 },
    consent: { label: "Consent", required: true, oneOf: ["yes"] },
  },
};

export function validate(schema, form) {
  const data = {};
  const errors = [];
  for (const [key, rule] of Object.entries(schema.fields)) {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (rule.required) errors.push(`${rule.label} is required.`);
      continue;
    }
    if (rule.max && value.length > rule.max) { errors.push(`${rule.label} is too long.`); continue; }
    if (rule.oneOf && !rule.oneOf.includes(value)) { errors.push(`${rule.label} has an invalid value.`); continue; }
    if (rule.type === "email" && !EMAIL_RE.test(value)) { errors.push(`${rule.label} does not look like an email address.`); continue; }
    if (rule.type === "phone") {
      const digits = value.replace(/^\+61/, "0").replace(/\D/g, "");
      if (!PHONE_RE.test(value) || digits.length < 8 || digits.length > 12) { errors.push(`${rule.label} does not look like a phone number.`); continue; }
    }
    if (rule.type === "date" && (!DATE_RE.test(value) || Number.isNaN(Date.parse(value)))) { errors.push(`${rule.label} is not a valid date.`); continue; }
    data[key] = value;
  }
  return { data, errors };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page(status, title, lines, back = "/") {
  const items = lines.map((l) => `<li>${esc(l)}</li>`).join("");
  const body = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | DP Xpress</title><link rel="stylesheet" href="/styles.css"></head><body><main id="main" class="wrap" style="padding:3rem 1rem"><h1>${esc(title)}</h1><ul>${items}</ul><p>Use your browser&#39;s Back button to keep what you typed, or <a href="${esc(back)}">open the form again</a>.</p></main></body></html>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function readForm(request) {
  const ct = request.headers.get("content-type") || "";
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(ct)) return { error: page(415, "Unsupported form", ["Please submit the form from the website."]) };
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return { error: page(413, "Form too large", ["Please shorten your message and try again."]) };
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) return { error: page(413, "Form too large", ["Please shorten your message and try again."]) };
  const form = await new Request("http://local/", { method: "POST", headers: { "content-type": ct }, body: buf }).formData();
  return { form };
}

const noCrlf = (s) => String(s).replace(/[\r\n]+/g, " ");

export function isConfigured(env) {
  return Boolean(env && env.FORM_TO_EMAIL && env.FORM_FROM_EMAIL && env.SEND_EMAIL);
}

// Cloudflare Email Routing send_email binding. Only reached when isConfigured(env) is true.
export async function deliver(env, schema, data) {
  const { EmailMessage } = await import("cloudflare:email");
  const lines = Object.entries(schema.fields)
    .filter(([k]) => data[k] !== undefined)
    .map(([k, rule]) => `${rule.label}: ${data[k]}`);
  const subject = noCrlf(`Website ${schema.name}: ${data.company || data.name}`);
  const raw = [
    `From: DP Xpress website <${noCrlf(env.FORM_FROM_EMAIL)}>`,
    `To: ${noCrlf(env.FORM_TO_EMAIL)}`,
    `Reply-To: ${noCrlf(data.email)}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@${noCrlf(env.FORM_FROM_EMAIL.split("@")[1])}>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    lines.join("\r\n"),
  ].join("\r\n");
  await env.SEND_EMAIL.send(new EmailMessage(env.FORM_FROM_EMAIL, env.FORM_TO_EMAIL, raw));
}

// `send` is injectable so tests can exercise the configured path without the Workers runtime.
export async function handle({ request, env }, schema, send = deliver) {
  const { form, error } = await readForm(request);
  if (error) return error;

  // Honeypot filled: almost certainly a bot. Answer like a success so it learns nothing,
  // but send nothing.
  if (typeof form.get("hp_check") === "string" && form.get("hp_check").trim() !== "") {
    return new Response(null, { status: 303, headers: { location: "/thanks.html" } });
  }

  const { data, errors } = validate(schema, form);
  if (errors.length) return page(400, "Please check the form", errors, schema.back);

  if (!isConfigured(env)) {
    return page(503, "Form not connected yet", ["Our online form is not connected yet. Please call or email us instead."], schema.back);
  }

  try {
    await send(env, schema, data);
  } catch (e) {
    // Do not log form contents: they contain personal information.
    console.error(`form delivery failed (${schema.name}): ${e && e.name}`);
    return page(502, "We could not send your form", ["Something went wrong on our side. Please try again later, or call or email us."], schema.back);
  }
  return new Response(null, { status: 303, headers: { location: "/thanks.html" } });
}
