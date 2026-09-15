// ==========================================
// CONTROL DEL MENÚ DESPLEGABLE (MÓVIL)
// ==========================================
const sidebar = document.getElementById('sidebar');
const menuOverlay = document.getElementById('menuOverlay');
const btnMenuToggle = document.getElementById('btnMenuToggle');
const btnCloseMenu = document.getElementById('btnCloseMenu');

function openMenu() {
  sidebar.classList.add('open');
  menuOverlay.classList.add('active');
  document.body.style.overflow = 'hidden'; // Evita que se scrollee la página de fondo
}

function closeMenu() {
  sidebar.classList.remove('open');
  menuOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

if (btnMenuToggle) btnMenuToggle.addEventListener('click', openMenu);
if (btnCloseMenu) btnCloseMenu.addEventListener('click', closeMenu);
if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);

// Cerrar el menú automáticamente al tocar un género en celular
document.querySelectorAll('.genre-link').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      closeMenu();
    }
  });
});
