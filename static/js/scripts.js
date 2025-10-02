const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebar = document.querySelector(".sidebar");
const mainContent = document.querySelector(".main-content");

sidebarToggleBtn.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");

  // Optional: adjust main content margin dynamically
  if (sidebar.classList.contains("collapsed")) {
    mainContent.style.marginLeft = "90px";
  } else {
    mainContent.style.marginLeft = "250px";
  }
});
