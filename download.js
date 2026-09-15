// ====================================================
// CONFIGURACIÓN RAPIDAPI
// ====================================================
const RAPIDAPI_KEY = 'bfc61495bdmsh27d4202f3fc9a11p1b93b8jsn28435328d6e5';
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

// Control de apertura/cierre del menú en móvil
const sidebar = document.getElementById('sidebar');
const menuOverlay = document.getElementById('menuOverlay');
const btnMenuToggle = document.getElementById('btnMenuToggle');
const btnCloseMenu = document.getElementById('btnCloseMenu');

if (btnMenuToggle) {
  btnMenuToggle.addEventListener('click', () => {
    if (sidebar) sidebar.classList.add('open');
    if (menuOverlay) menuOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
}

if (btnCloseMenu) {
  btnCloseMenu.addEventListener('click', () => {
    if (sidebar) sidebar.classList.remove('open');
    if (menuOverlay) menuOverlay.classList.remove('active');
    document.body.style.overflow = '';
  });
}

if (menuOverlay) {
  menuOverlay.addEventListener('click', () => {
    if (sidebar) sidebar.classList.remove('open');
    if (menuOverlay) menuOverlay.classList.remove('active');
    document.body.style.overflow = '';
  });
}

// Elementos DOM
const ytInput = document.getElementById('ytInput');
const ytSearchBtn = document.getElementById('ytSearchBtn');
const downloadCard = document.getElementById('downloadCard');
const dlBadge = document.getElementById('dlBadge');
const dlTitle = document.getElementById('dlTitle');
const dlStatus = document.getElementById('dlStatus');
const dlActionBtn = document.getElementById('dlActionBtn');
const dlAddToLibBtn = document.getElementById('dlAddToLibBtn');
const dlCloseBtn = document.getElementById('dlCloseBtn');

let currentDownloadUrl = null;
let currentTrackTitle = null;

// Extraer ID de YouTube
function extractVideoId(urlOrId) {
  const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : urlOrId.trim();
}

// LÓGICA ORIGINAL DIRECTA (1 petición por intento)
async function convertVideo() {
  const query = ytInput.value.trim();
  if (!query) {
    alert("Pega un enlace o ID de YouTube.");
    return;
  }

  const videoId = extractVideoId(query);

  downloadCard.style.display = 'flex';
  if (dlBadge) dlBadge.textContent = "CONSULTANDO";
  dlTitle.textContent = "Procesando video...";
  dlStatus.textContent = "Extrayendo audio desde YouTube...";
  dlActionBtn.textContent = "Cargando...";
  dlActionBtn.disabled = true;
  if (dlAddToLibBtn) dlAddToLibBtn.style.display = 'none';

  try {
    const res = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const data = await res.json();

    // 1. Éxito: Enlace generado
    if (data.status === 'ok' && data.link) {
      currentDownloadUrl = data.link;
      currentTrackTitle = data.title || "YouTube Audio";

      if (dlBadge) dlBadge.textContent = "LISTO";
      dlTitle.textContent = currentTrackTitle;
      dlStatus.textContent = `Duración: ${Math.floor(data.duration || 0)}s · MP3 192kbps`;
      
      dlActionBtn.textContent = "Descargar MP3 ⭳";
      dlActionBtn.disabled = false;
      dlActionBtn.onclick = () => window.open(data.link, '_blank');

      if (dlAddToLibBtn) {
        dlAddToLibBtn.style.display = 'inline-block';
        dlAddToLibBtn.textContent = "+ Guardar en App";
        dlAddToLibBtn.disabled = false;
        dlAddToLibBtn.onclick = saveDirectlyToDatabase;
      }

    // 2. Procesando: Reintento manual para no consumir tokens en bucles
    } else if (data.status === 'processing') {
      if (dlBadge) dlBadge.textContent = "EN COLA";
      dlTitle.textContent = "Convirtiendo...";
      dlStatus.textContent = "Procesando en servidores. Espera unos 5 segundos y pulsa Reintentar.";
      dlActionBtn.textContent = "Reintentar";
      dlActionBtn.disabled = false;
      dlActionBtn.onclick = convertVideo;

    } else {
      throw new Error(data.msg || "No se pudo obtener el audio.");
    }

  } catch (err) {
    console.error(err);
    if (dlBadge) dlBadge.textContent = "ERROR";
    dlTitle.textContent = "Error al convertir";
    dlStatus.textContent = "Verifica tu link o el límite de peticiones de RapidAPI.";
    dlActionBtn.textContent = "Reintentar";
    dlActionBtn.disabled = false;
    dlActionBtn.onclick = convertVideo;
  }
}

// Eventos de usuario
if (ytSearchBtn) ytSearchBtn.addEventListener('click', convertVideo);
if (ytInput) {
  ytInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') convertVideo();
  });
}
if (dlCloseBtn) {
  dlCloseBtn.addEventListener('click', () => {
    downloadCard.style.display = 'none';
  });
}

// ====================================================
// CONEXIÓN A INDEXEDDB (Misma BD que index.html)
// ====================================================
const DB_NAME = 'YugenMusicDB';
const DB_VERSION = 3;
const STORE_NAME = 'tracks';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectlyToDatabase() {
  if (!currentDownloadUrl) return;

  dlAddToLibBtn.textContent = "Guardando...";
  dlAddToLibBtn.disabled = true;

  try {
    const audioRes = await fetch(currentDownloadUrl);
    if (!audioRes.ok) throw new Error("No se pudo descargar el archivo temporal.");

    const audioBlob = await audioRes.blob();
    const db = await openDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const trackData = {
        title: currentTrackTitle,
        size: (audioBlob.size / (1024 * 1024)).toFixed(1) + " MB",
        genre: 'Otros',
        blob: audioBlob
      };
      const req = store.add(trackData);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    dlAddToLibBtn.textContent = "✓ ¡Guardada!";
  } catch (err) {
    console.error("Error al guardar en BD:", err);
    alert("Para esta canción, usa 'Descargar MP3' y agrégala desde '+ Subir Archivos' en Inicio.");
    dlAddToLibBtn.textContent = "Error al guardar";
    dlAddToLibBtn.disabled = false;
  }
}