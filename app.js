// Service Worker Offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn(err));
  });
}

// Elementos DOM
const audioPicker = document.getElementById('audioPicker');
const btnUpload = document.getElementById('btnUpload');
const songsGrid = document.getElementById('songsGrid');
const emptyState = document.getElementById('emptyState');
const trackCount = document.getElementById('trackCount');
const sectionTitle = document.getElementById('sectionTitle');
const localSearchInput = document.getElementById('localSearchInput');
const genreLinks = document.querySelectorAll('.genre-link');

// Reproductor inferior
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const nowPlayingMeta = document.getElementById('nowPlayingMeta');
const playerMiniCover = document.getElementById('playerMiniCover');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const totalDurationEl = document.getElementById('totalDuration');

const audio = new Audio();
let fullPlaylist = [];
let filteredPlaylist = [];
let currentIndex = 0;
let currentGenre = 'Todos';

// ==========================================
// BASE DE DATOS (IndexedDB)
// ==========================================
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

async function saveTrackToDB(file) {
  const db = await openDB();
  const buffer = await file.arrayBuffer();
  const audioBlob = new Blob([buffer], { type: file.type || 'audio/mpeg' });

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const trackData = {
      title: file.name.replace(/\.[^/.]+$/, ""),
      size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      genre: 'Otros',
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

// ==========================================
// INICIALIZACIÓN Y EVENTOS
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  setupMediaSession();
  try {
    const saved = await loadAllTracksFromDB();
    if (saved && saved.length > 0) {
      fullPlaylist = saved.map(t => ({
        id: t.id,
        title: t.title,
        size: t.size,
        genre: t.genre || 'Otros',
        blob: t.blob,
        url: URL.createObjectURL(t.blob)
      }));
      applyFilters();
      loadTrack(0);
    } else {
      emptyState.style.display = 'block';
    }
  } catch (err) {
    console.error("Error al cargar la base de datos:", err);
  }
});

btnUpload.addEventListener('click', () => audioPicker.click());

audioPicker.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  for (const file of files) {
    const saved = await saveTrackToDB(file);
    fullPlaylist.push({
      id: saved.id,
      title: saved.title,
      size: saved.size,
      genre: saved.genre,
      blob: saved.blob,
      url: URL.createObjectURL(saved.blob)
    });
  }

  applyFilters();
  if (!audio.src || audio.src === '') loadTrack(0);
  audioPicker.value = '';
});

// Filtros y búsqueda
function applyFilters() {
  const query = localSearchInput.value.toLowerCase().trim();

  filteredPlaylist = fullPlaylist.filter(t => {
    const matchSearch = t.title.toLowerCase().includes(query);
    const matchGenre = (currentGenre === 'Todos') || (t.genre === currentGenre);
    return matchSearch && matchGenre;
  });

  renderGrid();
}

localSearchInput.addEventListener('input', applyFilters);

genreLinks.forEach(link => {
  link.addEventListener('click', () => {
    genreLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    currentGenre = link.getAttribute('data-genre');
    sectionTitle.textContent = currentGenre === 'Todos' ? 'Tus Canciones' : currentGenre;
    applyFilters();
  });
});

// ==========================================
// RENDERIZADO CUADRÍCULA ESTILO SPOTIFY
// ==========================================
function renderGrid() {
  songsGrid.innerHTML = '';

  if (filteredPlaylist.length === 0) {
    emptyState.style.display = 'block';
    trackCount.textContent = '0 canciones';
    return;
  }

  emptyState.style.display = 'none';
  trackCount.textContent = `${filteredPlaylist.length} canci${filteredPlaylist.length > 1 ? 'ones' : 'ón'}`;

  filteredPlaylist.forEach((track, idx) => {
    const card = document.createElement('div');
    card.className = `music-card ${idx === currentIndex ? 'active' : ''}`;
    
    card.innerHTML = `
      <div class="card-artwork">
        ♫
        <div class="card-play-hover">${idx === currentIndex && !audio.paused ? '⏸' : '▶'}</div>
      </div>
      <p class="card-title" title="${track.title}">${track.title}</p>
      <p class="card-desc">${track.genre} · ${track.size}</p>
    `;

    card.addEventListener('click', () => {
      if (currentIndex === idx && !audio.paused) {
        pauseAudio();
      } else {
        currentIndex = idx;
        loadTrack(currentIndex);
        playAudio();
      }
    });

    songsGrid.appendChild(card);
  });
}

// ==========================================
// REPRODUCCIÓN
// ==========================================
function loadTrack(index) {
  if (!filteredPlaylist[index]) return;
  currentIndex = index;
  const track = filteredPlaylist[index];

  audio.src = track.url;
  nowPlayingTitle.textContent = track.title;
  nowPlayingMeta.textContent = `${track.genre} · ${track.size}`;

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: 'YŪGEN Local',
      album: track.genre,
      artwork: [
        { src: 'img/logo.png', sizes: '192x192', type: 'image/png' }
      ]
    });
  }

  highlightActiveCard();
}

function playAudio() {
  if (!audio.src) return;
  audio.play().then(() => {
    playPauseBtn.textContent = '⏸';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    highlightActiveCard();
  }).catch(() => {});
}

function pauseAudio() {
  audio.pause();
  playPauseBtn.textContent = '▶';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  highlightActiveCard();
}

function playNextTrack() {
  if (filteredPlaylist.length <= 1) return;
  currentIndex = (currentIndex + 1) % filteredPlaylist.length;
  loadTrack(currentIndex);
  playAudio();
}

function playPrevTrack() {
  if (filteredPlaylist.length <= 1) return;
  currentIndex = (currentIndex - 1 + filteredPlaylist.length) % filteredPlaylist.length;
  loadTrack(currentIndex);
  playAudio();
}

function highlightActiveCard() {
  const cards = document.querySelectorAll('.music-card');
  cards.forEach((c, idx) => {
    c.classList.toggle('active', idx === currentIndex);
    const hoverBtn = c.querySelector('.card-play-hover');
    if (hoverBtn) {
      hoverBtn.textContent = (idx === currentIndex && !audio.paused) ? '⏸' : '▶';
    }
  });
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', playAudio);
  navigator.mediaSession.setActionHandler('pause', pauseAudio);
  navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
  navigator.mediaSession.setActionHandler('previoustrack', playPrevTrack);
}

playPauseBtn.addEventListener('click', () => {
  if (filteredPlaylist.length === 0) {
    audioPicker.click();
    return;
  }
  audio.paused ? playAudio() : pauseAudio();
});

nextBtn.addEventListener('click', playNextTrack);
prevBtn.addEventListener('click', playPrevTrack);
audio.addEventListener('ended', playNextTrack);

audio.addEventListener('timeupdate', () => {
  if (!isNaN(audio.duration)) {
    progressBar.value = (audio.currentTime / audio.duration) * 100;
    currentTimeEl.textContent = formatTime(audio.currentTime);
    totalDurationEl.textContent = formatTime(audio.duration);
  }
});

progressBar.addEventListener('input', () => {
  if (!isNaN(audio.duration)) {
    audio.currentTime = (progressBar.value / 100) * audio.duration;
  }
});

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

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