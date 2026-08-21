(function () {
  try {
    var stored = localStorage.getItem("flowcash-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
  try {
    var fs = localStorage.getItem("flowcash-font-scale");
    var sizes = { small: "14px", medium: "16px", large: "18px" };
    document.documentElement.style.fontSize = sizes[fs] || sizes.medium;
  } catch (e) {}
})();
