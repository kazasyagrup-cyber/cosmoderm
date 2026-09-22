(function () {
  const toggle = document.getElementById("legal-lang-toggle");
  if (!toggle) return;

  function apply(lang) {
    document.querySelectorAll("[data-lang-block]").forEach((el) => {
      el.classList.toggle("is-active", el.getAttribute("data-lang-block") === lang);
    });
    toggle.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.lang === lang);
    });
    document.documentElement.lang = lang;
  }

  toggle.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem("cosmoderm-lang", btn.dataset.lang);
      apply(btn.dataset.lang);
    });
  });

  const saved = localStorage.getItem("cosmoderm-lang") === "kz" ? "kz" : "ru";
  apply(saved);
})();
