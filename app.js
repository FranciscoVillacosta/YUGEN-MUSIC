// ================= CONFIGURACIÓN DE APIS =================
const YT_API_KEY = "AIzaSyCJW2j5lvxaXocDs8_AIrJlR0DxErio6GM";

// Llena estos dos datos con los de tu RapidAPI
const RAPIDAPI_KEY = "TU_RAPIDAPI_KEY_AQUI";
const RAPIDAPI_HOST = "TU_RAPIDAPI_HOST_AQUI"; 

// ================= REFERENCIAS DEL DOM =================
const searchInput = document.getElementById("localSearchInput");
const ytDropdown = document.getElementById("ytDropdown");
const btnUpload = document.getElementById("btnUpload");
const audioPicker = document.getElementById("audioPicker");
const songsGrid = document.getElementById("songsGrid");
const emptyState = document.getElementById("emptyState");
const trackCount = document.getElementById("trackCount");

// Elementos del reproductor
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progressBar");
const currentTimeEl = document.getElementById("currentTime");
const totalDurationEl = document.getElementById("totalDuration");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingMeta = document.getElementById("nowPlayingMeta");

// Estado del reproductor
let biblioteca = [];
let currentIndex = -1;
const audioPlayer = new Audio();
let searchTimeout = null;

// ================= BÚSQUEDA EN YOUTUBE (DEBOUNCE) =================
searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim();

  // Filtrado local primero
  filtrarBibliotecaLocal(query);

  // Si tiene al menos 3 letras, consultar YouTube tras 400ms de inactividad
  clearTimeout(searchTimeout);
  if (query.length >= 3) {
    searchTimeout = setTimeout(() => {
      consultarYouTube(query);
    }, 450);
  } else {
    ytDropdown.style.display = "none";
  }
});

async function consultarYouTube(query) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${YT_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.items && data.items.length > 0) {
      renderizarResultadosYT(data.items);
    } else {
      ytDropdown.style.display = "none";
    }
  } catch (err) {
    console.error("Error al buscar en YouTube:", err);
  }
}

function renderizarResultadosYT(items) {
  ytDropdown.innerHTML = `<div style="padding: 8px 14px; font-size: 11px; color: #00f5d4; font-weight: bold; border-bottom: 1px solid #1f1836;">RESULTADOS DE YOUTUBE</div>`;
  
  items.forEach(item => {
    const videoId = item.id.videoId;
    const title = item.snippet.title;
    const channel = item.snippet.channelTitle;
    const thumb = item.snippet.thumbnails.default.url;

    const row = document.createElement("div");
    row.className = "yt-item";
    row.innerHTML = `
      <img src="${thumb}" class="yt-thumb" alt="Miniatura">
      <div class="yt-info">
        <p class="yt-title">${title}</p>
        <p class="yt-channel">${channel}</p>
      </div>
      <button class="btn-yt-dl" type="button">Descargar</button>
    `;

    // Click en la fila para descargar con tu RapidAPI
    row.onclick = () => {
      ytDropdown.style.display = "none";
      descargarConRapidAPI(videoId, title);
    };

    ytDropdown.appendChild(row);
  });

  ytDropdown.style.display = "block";
}

// Ocultar desplegable si se hace click fuera
document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !ytDropdown.contains(e.target)) {
    ytDropdown.style.display = "none";
  }
});

// ================= DESCARGA RAPIDAPI =================
async function descargarConRapidAPI(videoId, titulo) {
  nowPlayingTitle.textContent = "Procesando descarga...";
  nowPlayingMeta.textContent = titulo;

  try {
    const options = {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST
      }
    };

    // Reemplaza con el endpoint exacto que te dio RapidAPI
    const res = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${videoId}`, options);
    const data = await res.json();
    const downloadUrl = data.link || data.download_url || data.url;

    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
      nowPlayingTitle.textContent = "Descarga iniciada";
    } else {
      alert("No se pudo obtener el audio. Verifica tu plan en RapidAPI.");
    }
  } catch (error) {
    console.error("Error al descargar:", error);
    alert("Error conectando con la API de descarga.");
  }
}

// ================= ARCHIVOS LOCALES =================
btnUpload.addEventListener("click", () => audioPicker.click());

audioPicker.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    biblioteca.push({
      nombre: file.name.replace(/\.[^/.]+$/, ""),
      artista: "Archivo Local",
      url: URL.createObjectURL(file)
    });
  });
  actualizarVista();
});

function actualizarVista() {
  songsGrid.innerHTML = "";
  trackCount.textContent = `${biblioteca.length} canciones`;

  if (biblioteca.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  biblioteca.forEach((cancion, idx) => {
    const card = document.createElement("div");
    card.style.cssText = "background: #1a1528; border: 1px solid #2d224b; border-radius: 8px; padding: 12px; cursor: pointer; transition: 0.2s;";
    card.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 8px;">🎵</div>
      <p style="color: #fff; font-weight: bold; font-size: 13px; margin: 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${cancion.nombre}</p>
      <span style="color: #8878aa; font-size: 11px;">${cancion.artista}</span>
    `;
    card.onclick = () => reproducirCancion(idx);
    songsGrid.appendChild(card);
  });
}

function filtrarBibliotecaLocal(query) {
  const cards = songsGrid.children;
  Array.from(cards).forEach((card, idx) => {
    const track = biblioteca[idx];
    if (track && track.nombre.toLowerCase().includes(query.toLowerCase())) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

// ================= REPRODUCTOR =================
function reproducirCancion(idx) {
  if (idx < 0 || idx >= biblioteca.length) return;
  currentIndex = idx;
  const track = biblioteca[idx];

  audioPlayer.src = track.url;
  audioPlayer.play();
  playPauseBtn.textContent = "⏸";
  nowPlayingTitle.textContent = track.nombre;
  nowPlayingMeta.textContent = track.artista;
}

playPauseBtn.addEventListener("click", () => {
  if (!audioPlayer.src) {
    if (biblioteca.length > 0) reproducirCancion(0);
    return;
  }
  if (audioPlayer.paused) {
    audioPlayer.play();
    playPauseBtn.textContent = "⏸";
  } else {
    audioPlayer.pause();
    playPauseBtn.textContent = "▶";
  }
});

prevBtn.addEventListener("click", () => {
  if (biblioteca.length === 0) return;
  const prev = (currentIndex - 1 + biblioteca.length) % biblioteca.length;
  reproducirCancion(prev);
});

nextBtn.addEventListener("click", () => {
  if (biblioteca.length === 0) return;
  const next = (currentIndex + 1) % biblioteca.length;
  reproducirCancion(next);
});

audioPlayer.addEventListener("timeupdate", () => {
  if (audioPlayer.duration) {
    progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    currentTimeEl.textContent = formatearSegundos(audioPlayer.currentTime);
    totalDurationEl.textContent = formatearSegundos(audioPlayer.duration);
  }
});

progressBar.addEventListener("input", () => {
  if (audioPlayer.duration) {
    audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
  }
});

function formatearSegundos(seg) {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Menú móvil desplegable
const btnMenuToggle = document.getElementById("btnMenuToggle");
const btnCloseMenu = document.getElementById("btnCloseMenu");
const sidebar = document.getElementById("sidebar");
const menuOverlay = document.getElementById("menuOverlay");

if (btnMenuToggle) {
  btnMenuToggle.onclick = () => {
    sidebar.classList.add("open");
    menuOverlay.classList.add("active");
  };
}
if (btnCloseMenu) {
  btnCloseMenu.onclick = () => {
    sidebar.classList.remove("open");
    menuOverlay.classList.remove("active");
  };
}
if (menuOverlay) {
  menuOverlay.onclick = () => {
    sidebar.classList.remove("open");
    menuOverlay.classList.remove("active");
  };
}
