// ====================================================
// 0. MODO OFFLINE (Service Worker)
// ====================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Modo offline activo'))
      .catch(err => console.warn('Aviso SW:', err));
  });
}

// ====================================================
// 1. CONFIGURACIÓN RAPIDAPI
// ====================================================
const RAPIDAPI_KEY = 'bfc61495bdmsh27d4202f3fc9a11p1b93b8jsn28435328d6e5';
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

// Elementos Descarga YouTube
const ytInput = document.getElementById('ytInput');
const ytSearchBtn = document.getElementById('ytSearchBtn');
const downloadCard = document.getElementById('downloadCard');
const dlTitle = document.getElementById('dlTitle');
const dlStatus = document.getElementById('dlStatus');
const dlActionBtn = document.getElementById('dlActionBtn');
const dlCloseBtn = document.getElementById('dlCloseBtn');

function extractVideoId(urlOrId) {
  const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : urlOrId.trim();
}

async function convertYouTubeVideo() {
  const query = ytInput.value.trim();
  if (!query) {
    alert("Pega un enlace o ID de YouTube en el buscador.");
    return;
  }

  const videoId = extractVideoId(query);

  if (downloadCard) downloadCard.style.display = 'flex';
  if (dlTitle) dlTitle.textContent = "Procesando video...";
  if (dlStatus) dlStatus.textContent = "Extrayendo audio desde YouTube...";
  if (dlActionBtn) {
    dlActionBtn.textContent = "Cargando...";
    dlActionBtn.disabled = true;
  }

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
      if (dlTitle) dlTitle.textContent = data.title || "Audio Listo";
      if (dlStatus) dlStatus.textContent = `Duración: ${Math.floor(data.duration || 0)}s · MP3 Calidad 192k`;
      if (dlActionBtn) {
        dlActionBtn.textContent = "Descargar MP3 ⭳";
        dlActionBtn.disabled = false;
        dlActionBtn.onclick = () => {
          window.open(data.link, '_blank');
        };
      }
    } else if (data.status === 'processing') {
      if (dlTitle) dlTitle.textContent = "Convirtiendo...";
      if (dlStatus) dlStatus.textContent = "El servidor está procesando el archivo, pulsa reintentar en unos segundos.";
      if (dlActionBtn) {
        dlActionBtn.textContent = "Reintentar";
        dlActionBtn.disabled = false;
        dlActionBtn.onclick = convertYouTubeVideo;
      }
    } else {
      throw new Error(data.msg || "No se pudo obtener el audio.");
    }

  } catch (error) {
    console.error(error);
    if (dlTitle) dlTitle.textContent = "Error al descargar";
    if (dlStatus) dlStatus.textContent = "Verifica el enlace o tu conexión a internet.";
    if (dlActionBtn) {
      dlActionBtn.textContent = "Reintentar";
      dlActionBtn.disabled = false;
      dlActionBtn.onclick = convertYouTubeVideo;
    }
  }
}

if (ytSearchBtn) ytSearchBtn.addEventListener('click', convertYouTubeVideo);
if (ytInput) {
  ytInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') convertYouTubeVideo();
  });
}
if (dlCloseBtn && downloadCard) {
  dlCloseBtn.addEventListener('click', () => {
    downloadCard.style.display = 'none';
  });
}

// ====================================================
// 2. BASE DE DATOS LOCAL OFFLINE (IndexedDB)
// ====================================================
const DB_NAME = 'YugenMusicDB';
const DB_VERSION = 2;
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

async function saveTrackToDB(file) {
  const db = await openDB();
  
  // Convertir a ArrayBuffer para persistencia física sin conexión
  const buffer = await file.arrayBuffer();
  const audioBlob = new Blob([buffer], { type: file.type || 'audio/mpeg' });

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const trackData = {
      title: file.name.replace(/\.[^/.]+$/, ""),
      size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      blob: audioBlob
    };
    const req = store.add(trackData);
    req.onsuccess = () => resolve({ ...trackData, id: req.result });
    req.onerror = () => reject(req.error);
  });
}

async function loadAllTracksFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteTrackFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ====================================================
// 3. GESTIÓN DE LA LISTA Y REPRODUCTOR
// ====================================================
const audioPicker = document.getElementById('audioPicker');
const btnUpload = document.getElementById('btnUpload');
const emptyState = document.getElementById('emptyState');
const playlistView = document.getElementById('playlistView');
const trackCount = document.getElementById('trackCount');

const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const nowPlayingMeta = document.getElementById('nowPlayingMeta');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const totalDurationEl = document.getElementById('totalDuration');

const audio = new Audio();
let playlist = [];
let currentIndex = 0;

// Cargar pistas guardadas
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const savedTracks = await loadAllTracksFromDB();
    if (savedTracks && savedTracks.length > 0) {
      playlist = savedTracks.map(track => ({
        id: track.id,
        title: track.title,
        size: track.size,
        blob: track.blob,
        url: URL.createObjectURL(track.blob)
      }));
      updatePlaylistUI();
      loadTrack(0);
    }
  } catch (err) {
    console.error("Error al leer base local:", err);
  }
});

// Subir archivos locales
if (btnUpload && audioPicker) {
  btnUpload.addEventListener('click', () => audioPicker.click());

  audioPicker.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      const saved = await saveTrackToDB(file);
      playlist.push({
        id: saved.id,
        title: saved.title,
        size: saved.size,
        blob: saved.blob,
        url: URL.createObjectURL(saved.blob)
      });
    }

    updatePlaylistUI();

    if (!audio.src || audio.src === '') {
      loadTrack(0);
    }

    audioPicker.value = '';
  });
}

function updatePlaylistUI() {
  if (playlist.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (playlistView) playlistView.innerHTML = '';
    if (trackCount) trackCount.textContent = '0 pistas';
    if (nowPlayingTitle) nowPlayingTitle.textContent = 'Selecciona una pista';
    if (nowPlayingMeta) nowPlayingMeta.textContent = 'YŪGEN Music';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (playlistView) playlistView.innerHTML = '';
  if (trackCount) trackCount.textContent = `${playlist.length} pista${playlist.length > 1 ? 's' : ''}`;

  playlist.forEach((song, idx) => {
    const li = document.createElement('li');
    li.className = `track-item ${idx === currentIndex ? 'active' : ''}`;
    li.innerHTML = `
      <div class="track-item-left">
        <span class="track-index">${idx + 1}</span>
        <div class="track-text">
          <p class="track-title">${song.title}</p>
          <p class="track-meta">${song.size}</p>
        </div>
      </div>
      <div class="track-item-right">
        <div class="play-badge">${idx === currentIndex && !audio.paused ? '⏸' : '▶'}</div>
        <button type="button" class="btn-delete" title="Eliminar de la lista">✕</button>
      </div>
    `;

    li.querySelector('.track-item-left').addEventListener('click', () => selectTrack(idx));
    li.querySelector('.play-badge').addEventListener('click', () => selectTrack(idx));

    li.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeTrack(idx);
    });

    if (playlistView) playlistView.appendChild(li);
  });
}

function selectTrack(idx) {
  if (currentIndex === idx && !audio.paused) {
    pauseAudio();
  } else {
    currentIndex = idx;
    loadTrack(currentIndex);
    playAudio();
  }
}

async function removeTrack(index) {
  const trackToRemove = playlist[index];
  await deleteTrackFromDB(trackToRemove.id);
  URL.revokeObjectURL(trackToRemove.url);
  playlist.splice(index, 1);

  if (playlist.length === 0) {
    audio.pause();
    audio.src = '';
    currentIndex = 0;
  } else if (index === currentIndex) {
    currentIndex = currentIndex % playlist.length;
    loadTrack(currentIndex);
    playAudio();
  } else if (index < currentIndex) {
    currentIndex--;
  }

  updatePlaylistUI();
}

function loadTrack(index) {
  if (!playlist[index]) return;
  currentIndex = index;
  const track = playlist[index];

  audio.src = track.url;
  if (nowPlayingTitle) nowPlayingTitle.textContent = track.title;
  if (nowPlayingMeta) nowPlayingMeta.textContent = `Pista ${index + 1} de ${playlist.length} · ${track.size}`;

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: 'YŪGEN Local Player',
      album: 'Almacenamiento Local'
    });
  }

  highlightActiveTrack();
}

function playAudio() {
  if (!audio.src) return;
  audio.play().then(() => {
    if (playPauseBtn) playPauseBtn.textContent = '⏸';
    highlightActiveTrack();
  }).catch(err => {
    console.warn("Reproducción en espera de interacción táctil:", err);
  });
}

function pauseAudio() {
  audio.pause();
  if (playPauseBtn) playPauseBtn.textContent = '▶';
  highlightActiveTrack();
}

function highlightActiveTrack() {
  const items = document.querySelectorAll('.track-item');
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === currentIndex);
    const badge = item.querySelector('.play-badge');
    if (badge) {
      badge.textContent = (idx === currentIndex && !audio.paused) ? '⏸' : '▶';
    }
  });
}

// Eventos de reproducción
if (playPauseBtn) {
  playPauseBtn.addEventListener('click', () => {
    if (playlist.length === 0) {
      if (audioPicker) audioPicker.click();
      return;
    }
    audio.paused ? playAudio() : pauseAudio();
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (playlist.length <= 1) return;
    currentIndex = (currentIndex + 1) % playlist.length;
    loadTrack(currentIndex);
    playAudio();
  });
}

if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    if (playlist.length <= 1) return;
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentIndex);
    playAudio();
  });
}

audio.addEventListener('ended', () => {
  currentIndex = (currentIndex + 1) % playlist.length;
  loadTrack(currentIndex);
  playAudio();
});

audio.addEventListener('timeupdate', () => {
  if (!isNaN(audio.duration)) {
    if (progressBar) progressBar.value = (audio.currentTime / audio.duration) * 100;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
    if (totalDurationEl) totalDurationEl.textContent = formatTime(audio.duration);
  }
});

if (progressBar) {
  progressBar.addEventListener('input', () => {
    if (!isNaN(audio.duration)) {
      audio.currentTime = (progressBar.value / 100) * audio.duration;
    }
  });
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}