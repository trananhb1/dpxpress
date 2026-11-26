// Cloudflare Worker for the site forms. NOT deployed and NOT served by GitHub Pages.
// Intended route: dpxpress.net/api/* (requires the domain to be proxied through Cloudflare).
import { handle, COURIER, DRIVER } from "./forms.js";

const ROUTES = { "/api/courier": COURIER, "/api/driver": DRIVER };

export default {
  async fetch(request, env) {
    const schema = ROUTES[new URL(request.url).pathname];
    if (!schema) return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    return handle({ request, env }, schema);
  },
};
