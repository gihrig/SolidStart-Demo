(function () {
  try {
    var stored = window.localStorage.getItem("theme");
    var mode = ["light", "dark", "auto"].includes(stored) ? stored : "auto";
    var root = document.documentElement;
    if (mode === "auto") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", mode);
    }
  } catch {}
})();
