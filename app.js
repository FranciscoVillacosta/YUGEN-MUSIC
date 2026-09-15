// ====================================================
// 0. REGISTRO SERVICE WORKER (OFFLINE)
// ====================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn(err));
  });
}

// ====================================================
// 1. CONTROL DEL MENÚ DESPLEGABLE (MÓVIL)
// ====================================================
const sidebar = document.getElementById('sidebar');
const menuOverlay = document.getElementById('menuOverlay');
const btnMenuToggle = document.getElementById('btnMenuToggle');
const btnCloseMenu = document.getElementById('btnCloseMenu');

function openMenu() {
  if (sidebar) sidebar.classList.add('open');
  if (menuOverlay) menuOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  if (sidebar) sidebar.classList.remove('open');
  if (menuOverlay) menuOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

if (btnMenuToggle) btnMenuToggle.addEventListener('click', openMenu);
if (btnCloseMenu) btnCloseMenu.addEventListener('click', closeMenu);
if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);

// ====================================================
// 2. REFERENCIAS DOM DEL REPRODUCTOR
// ====================================================
const audioPicker = document.getElementById('audioPicker');
const btnUpload = document.getElementById('btnUpload');
const songsGrid = document.getElementById('songsGrid');
const emptyState = document.getElementById('emptyState');
const trackCount = document.getElementById('trackCount');
const sectionTitle = document.getElementById('sectionTitle');
const localSearchInput = document.getElementById('localSearchInput');
const genreLinks = document.querySelectorAll('.genre-link');

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

// ====================================================
// 3. BASE DE DATOS LOCAL (IndexedDB)
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

// ====================================================
// 4. INICIALIZACIÓN
// ====================================================
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
      if (emptyState) emptyState.style.display = 'block';
    }
  } catch (err) {
    console.error("Error al cargar la base de datos:", err);
  }
});

// Cargar canciones locales
if (btnUpload && audioPicker) {
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
}

// ====================================================
// 5. FILTROS Y BÚSQUEDA
// ====================================================
function applyFilters() {
  const query = localSearchInput ? localSearchInput.value.toLowerCase().trim() : '';

  filteredPlaylist = fullPlaylist.filter(t => {
    const matchSearch = t.title.toLowerCase().includes(query);
    const matchGenre = (currentGenre === 'Todos') || (t.genre === currentGenre);
    return matchSearch && matchGenre;
  });

  renderGrid();
}

if (localSearchInput) {
  localSearchInput.addEventListener('input', applyFilters);
}

genreLinks.forEach(link => {
  link.addEventListener('click', () => {
    genreLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    currentGenre = link.getAttribute('data-genre');
    if (sectionTitle) {
      sectionTitle.textContent = currentGenre === 'Todos' ? 'Tus Canciones' : currentGenre;
    }
    applyFilters();
    if (window.innerWidth <= 768) closeMenu();
  });
});

// ====================================================
// 6. RENDERIZADO EN BARRITAS
// ====================================================
function renderGrid() {
  if (!songsGrid) return;
  songsGrid.innerHTML = '';

  if (filteredPlaylist.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (trackCount) trackCount.textContent = '0 canciones';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (trackCount) {
    trackCount.textContent = `${filteredPlaylist.length} canción${filteredPlaylist.length > 1 ? 'es' : ''}`;
  }

  filteredPlaylist.forEach((track, idx) => {
    const isActive = idx === currentIndex;
    const isPlaying = isActive && !audio.paused;

    const bar = document.createElement('div');
    bar.className = `music-bar ${isActive ? 'active' : ''}`;

    // Estilos inline de respaldo para asegurar fondo oscuro y distribución correcta
    bar.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
      padding: 10px 14px !important;
      margin-bottom: 8px !important;
      background: ${isActive 
        ? 'linear-gradient(90deg, rgba(147, 51, 234, 0.45) 0%, rgba(26, 17, 46, 0.95) 100%)' 
        : 'linear-gradient(135deg, rgba(28, 18, 48, 0.85) 0%, rgba(13, 10, 22, 0.95) 100%)'} !important;
      border: 1px solid ${isActive ? '#a855f7' : 'rgba(168, 85, 247, 0.25)'} !important;
      border-radius: 12px !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4) !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
    `;

    bar.innerHTML = `
      <div class="music-bar-left" style="display: flex; align-items: center; gap: 12px; overflow: hidden; flex: 1; pointer-events: none;">
        <div class="bar-mini-cover" style="width: 42px; height: 42px; min-width: 42px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed 0%, #3b0764 100%); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: #ffffff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);">
          ♫
        </div>
        <div class="bar-texts" style="overflow: hidden; display: flex; flex-direction: column; text-align: left;">
          <p class="bar-title" style="font-size: 0.9rem; font-weight: 700; color: #ffffff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${track.title}
          </p>
          <p class="bar-desc" style="font-size: 0.74rem; color: #c084fc; margin: 3px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${track.genre} · ${track.size}
          </p>
        </div>
      </div>
      <div class="music-bar-right" style="display: flex; align-items: center; margin-left: auto; padding-left: 12px; pointer-events: none;">
        <div class="bar-badge" style="width: 34px; height: 34px; min-width: 34px; border-radius: 50%; background: ${isPlaying ? '#c084fc' : 'linear-gradient(135deg, #9333ea 0%, #6b21a8 100%)'}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 12px; box-shadow: 0 2px 10px rgba(147, 51, 234, 0.5);">
          ${isPlaying ? '⏸' : '▶'}
        </div>
      </div>
    `;

    bar.addEventListener('click', () => {
      if (currentIndex === idx && !audio.paused) {
        pauseAudio();
      } else {
        currentIndex = idx;
        loadTrack(currentIndex);
        playAudio();
      }
      renderGrid();
    });

    songsGrid.appendChild(bar);
  });
}

// ====================================================
// 7. REPRODUCCIÓN Y EVENTOS DE AUDIO
// ====================================================
function loadTrack(index) {
  if (!filteredPlaylist[index]) return;
  currentIndex = index;
  const track = filteredPlaylist[index];

  audio.src = track.url;
  if (nowPlayingTitle) nowPlayingTitle.textContent = track.title;
  if (nowPlayingMeta) nowPlayingMeta.textContent = `${track.genre} · ${track.size}`;

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: 'YŪGEN Music',
      album: track.genre
    });
  }

  renderGrid();
}

function playAudio() {
  if (!audio.src) return;
  audio.play().then(() => {
    if (playPauseBtn) playPauseBtn.textContent = '⏸';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    renderGrid();
  }).catch(() => {});
}

function pauseAudio() {
  audio.pause();
  if (playPauseBtn) playPauseBtn.textContent = '▶';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  renderGrid();
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

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', playAudio);
  navigator.mediaSession.setActionHandler('pause', pauseAudio);
  navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
  navigator.mediaSession.setActionHandler('previoustrack', playPrevTrack);
}

if (playPauseBtn) {
  playPauseBtn.addEventListener('click', () => {
    if (filteredPlaylist.length === 0) {
      if (audioPicker) audioPicker.click();
      return;
    }
    audio.paused ? playAudio() : pauseAudio();
  });
}

if (nextBtn) nextBtn.addEventListener('click', playNextTrack);
if (prevBtn) prevBtn.addEventListener('click', playPrevTrack);
audio.addEventListener('ended', playNextTrack);

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

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}