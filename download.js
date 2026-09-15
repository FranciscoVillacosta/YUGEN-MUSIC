// ====================================================
// CONFIGURACIÓN RAPIDAPI
// ====================================================
const RAPIDAPI_KEY = 'bfc61495bdmsh27d4202f3fc9a11p1b93b8jsn28435328d6e5';
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

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

// Extrae el ID del video si es enlace completo
function extractVideoId(urlOrId) {
  const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : urlOrId.trim();
}

async function convertVideo() {
  const query = ytInput.value.trim();
  if (!query) {
    alert("Ingresa un enlace o ID de YouTube.");
    return;
  }

  const videoId = extractVideoId(query);

  // Estado de carga inicial
  downloadCard.style.display = 'flex';
  dlBadge.textContent = "CONVIRTIENDO";
  dlTitle.textContent = "Procesando audio...";
  dlStatus.textContent = "Contactando al servidor de conversión...";
  dlActionBtn.textContent = "Espere...";
  dlActionBtn.disabled = true;
  dlAddToLibBtn.style.display = 'none';

  try {
    const response = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const data = await response.json();

    if (data.status === 'ok' && data.link) {
      currentDownloadUrl = data.link;
      currentTrackTitle = data.title || "YouTube Audio";

      dlBadge.textContent = "LISTO";
      dlTitle.textContent = currentTrackTitle;
      dlStatus.textContent = `Duración: ${Math.floor(data.duration || 0)}s · MP3 192k`;
      
      dlActionBtn.textContent = "Descargar MP3 ⭳";
      dlActionBtn.disabled = false;
      dlActionBtn.onclick = () => window.open(currentDownloadUrl, '_blank');

      // Mostrar opción para guardarlo directo en IndexedDB
      dlAddToLibBtn.style.display = 'inline-block';
      dlAddToLibBtn.textContent = "+ Guardar en App";
      dlAddToLibBtn.disabled = false;
      dlAddToLibBtn.onclick = saveDirectlyToDatabase;

    } else if (data.status === 'processing') {
      dlBadge.textContent = "EN COLA";
      dlTitle.textContent = "Procesando pista...";
      dlStatus.textContent = "El servidor sigue convirtiendo, pulsa reintentar en unos segundos.";
      dlActionBtn.textContent = "Reintentar";
      dlActionBtn.disabled = false;
      dlActionBtn.onclick = convertVideo;
    } else {
      throw new Error(data.msg || "No se pudo generar el stream.");
    }

  } catch (error) {
    console.error(error);
    dlBadge.textContent = "ERROR";
    dlTitle.textContent = "Fallo en la descarga";
    dlStatus.textContent = "Verifica el link o el límite mensual de peticiones en RapidAPI.";
    dlActionBtn.textContent = "Reintentar";
    dlActionBtn.disabled = false;
    dlActionBtn.onclick = convertVideo;
  }
}

// Eventos de búsqueda
ytSearchBtn.addEventListener('click', convertVideo);
ytInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') convertVideo();
});
dlCloseBtn.addEventListener('click', () => {
  downloadCard.style.display = 'none';
});

// ====================================================
// CONEXIÓN A INDEXEDDB (Misma BD que app.js)
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

// Descarga el audio en memoria y lo guarda en IndexedDB
async function saveDirectlyToDatabase() {
  if (!currentDownloadUrl) return;

  dlAddToLibBtn.textContent = "Guardando...";
  dlAddToLibBtn.disabled = true;

  try {
    const audioRes = await fetch(currentDownloadUrl);
    if (!audioRes.ok) throw new Error("No se pudo obtener el archivo");

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
    alert("Para este archivo en particular, pulsa 'Descargar MP3' y luego súbelo en Inicio.");
    dlAddToLibBtn.textContent = "Error al guardar";
  }
}