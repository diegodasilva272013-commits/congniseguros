async function injectPartials(){
  const headerEl = document.querySelector("[data-include='header']");
  const footerEl = document.querySelector("[data-include='footer']");

  if (headerEl){
    const res = await fetch("partials/header.html");
    headerEl.innerHTML = await res.text();
  }
  if (footerEl){
    const res = await fetch("partials/footer.html");
    footerEl.innerHTML = await res.text();
  }

  const burger = document.querySelector("[data-burger]");
  const mobile = document.querySelector("[data-mobile]");
  if (burger && mobile){
    burger.addEventListener("click", () => {
      const open = mobile.style.display === "block";
      mobile.style.display = open ? "none" : "block";
    });
  }

  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-link]").forEach(a => {
    const href = a.getAttribute("href");
    if (href === path) a.classList.add("active");
  });

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
}
document.addEventListener("DOMContentLoaded", injectPartials);
