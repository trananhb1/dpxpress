// Mobile menu toggle. Without JS the menu simply stays open (see styles.css).
document.addEventListener("DOMContentLoaded", function () {
  var header = document.querySelector(".site-header");
  var btn = header && header.querySelector(".nav-toggle");
  if (!btn) return;
  btn.addEventListener("click", function () {
    var open = header.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Close" : "Menu";
  });
});
