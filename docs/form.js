// Progressive enhancement for the two forms. The site is static (GitHub Pages), so until the
// /api Worker exists a POST fails. Instead of leaving people on an error page, send via fetch
// and, on any failure, keep what they typed and show the phone/email fallback.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("form[data-fallback]").forEach(function (form) {
    var box = form.querySelector(".form-fallback");
    var btn = form.querySelector("button[type=submit]");
    form.addEventListener("submit", function (e) {
      if (!window.fetch || !box) return; // let the browser do a normal POST
      e.preventDefault();
      box.hidden = true;
      btn.disabled = true;
      fetch(form.action, {
        method: "POST",
        body: new URLSearchParams(new FormData(form)),
        headers: { Accept: "text/html" },
      })
        .then(function (res) {
          if (res.ok && /\/thanks\.html$/.test(new URL(res.url).pathname)) {
            window.location.href = "/thanks.html";
          } else {
            throw new Error("status " + res.status);
          }
        })
        .catch(function () {
          box.hidden = false;
          box.scrollIntoView({ block: "center" });
          box.setAttribute("tabindex", "-1");
          box.focus();
        })
        .finally(function () { btn.disabled = false; });
    });
  });
});
