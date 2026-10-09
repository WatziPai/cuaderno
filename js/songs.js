/* ===========================================================
   songs.js — Listening Here — Lógica principal
   Firebase Compat SDK
=========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyBf_w4RWd1AM7zP7XkbI9OvtOqgSErW0kE",
  authDomain: "cuaderno-f9282.firebaseapp.com",
  projectId: "cuaderno-f9282",
  storageBucket: "cuaderno-f9282.firebasestorage.app",
  messagingSenderId: "581697446950",
  appId: "1:581697446950:web:60dc452c46624ea85b72e7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

const auth = firebase.auth();

/* Slots en orden de presentación */
const SLOTS = ["5", "4", "3", "2", "1"];
const SLOT_FLAMES = { "5": 1, "4": 2, "3": 3, "2": 4, "1": 5 };


let currentUser   = null;   // { name, role }
let songsData     = {};     // { slot: songObj }
let reactionsData = {};     // { slot: { emoji: count } }
let currentOpenSlot = null; // slot del modal abierto
let inactivityTimer = null; // Timer de inactividad

/* ───────────────────────────────────────────────────────── */
/*  1. LOGIN (Firebase Auth) & INACTIVIDAD                   */
/* ───────────────────────────────────────────────────────── */

auth.onAuthStateChanged((user) => {
  if (user) {
    const isYen = user.email && user.email.toLowerCase().includes("yen");
    currentUser = {
      name: user.email.split('@')[0],
      role: isYen ? "viewer" : "admin"
    };
    
    document.getElementById("songApp").classList.remove("hidden");
    onLoggedIn();
    resetInactivityTimer();
  } else {
    // Si no está logueado, mandarlo al cuaderno para que se loguee
    window.location.href = "index.html";
  }
});

// Control de inactividad (1 hora = 3600000 ms)
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    auth.signOut();
  }, 3600000);
}

// Escuchar interacciones para resetear el timer
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
  document.addEventListener(event, resetInactivityTimer);
});

function onLoggedIn() {
  // Mostrar botón admin si corresponde
  if (currentUser.role === "admin") {
    document.getElementById("adminPanelBtn").classList.remove("hidden");
  }
  // Suscribirse a datos en tiempo real
  subscribeToSongs();
  subscribeToReactions();
}

document.getElementById("songLogoutBtn").addEventListener("click", () => {
  auth.signOut();
});

/* ───────────────────────────────────────────────────────── */
/*  2. FIREBASE LISTENERS                                    */
/* ───────────────────────────────────────────────────────── */
function subscribeToSongs() {
  db.collection("songs").onSnapshot(snapshot => {
    songsData = {};
    snapshot.forEach(doc => {
      songsData[doc.id] = { id: doc.id, ...doc.data() };
    });
    renderAll();
  });
}

function subscribeToReactions() {
  db.collection("reactions").onSnapshot(snapshot => {
    reactionsData = {};
    snapshot.forEach(doc => {
      reactionsData[doc.id] = doc.data();
    });
    // Si hay modal abierto, actualizar display
    if (currentOpenSlot) renderReactionsDisplay(currentOpenSlot);
  });
}

/* ───────────────────────────────────────────────────────── */
/*  3. RENDER                                               */
/* ───────────────────────────────────────────────────────── */
function renderAll() {
  renderOurSong();
  renderCountdown();
}

function renderOurSong() {
  const content = document.getElementById("ourSongContent");
  const song = songsData["oursong"];

  if (!song) {
    content.innerHTML = `
      <div class="song-locked-state">
        <div class="lock-icon">&#128274;</div>
        <p>Aun no revelada...</p>
      </div>`;
    return;
  }

  if (song.photoUrl) {
    document.getElementById("ourSongCard").classList.add("has-photo");
    document.getElementById("ourSongCard").style.backgroundImage = `url('${song.photoUrl}')`;
  } else {
    document.getElementById("ourSongCard").classList.remove("has-photo");
    document.getElementById("ourSongCard").style.backgroundImage = "none";
  }

  content.innerHTML = `
    <div class="our-song-unlocked">
      <div class="our-song-emoji">${song.emoji || "&#127925;"}</div>
      <div class="our-song-title">${escHtml(song.title)}</div>
      <div class="our-song-artist">${escHtml(song.artist)}</div>
      <button class="our-song-play" id="ourSongPlayBtn">&#127925; Escuchar</button>
    </div>`;

  document.getElementById("ourSongPlayBtn").addEventListener("click", e => {
    e.stopPropagation();
    openSongModal("oursong");
  });

  // Click en la tarjeta completa también abre
  document.getElementById("ourSongCard").onclick = () => openSongModal("oursong");
}

function renderCountdown() {
  const list = document.getElementById("countdownList");
  list.innerHTML = "";

  SLOTS.forEach(slot => {
    const song = songsData[slot];
    const flames = SLOT_FLAMES[slot];
    const flameStr = "&#128293;".repeat(flames);

    const item = document.createElement("div");
    item.className = "song-item" + (song ? "" : " locked");
    item.dataset.slot = slot;

    if (song) {
      item.innerHTML = `
        <div class="song-number">${slot}</div>
        <div class="song-item-emoji">${song.emoji || "&#127925;"}</div>
        <div class="song-item-info">
          <div class="song-item-title">${escHtml(song.title)}</div>
          <div class="song-item-artist">${escHtml(song.artist)}</div>
        </div>
        <div class="song-fire-display">${buildFlames(flames)}</div>`;

      item.addEventListener("click", () => openSongModal(slot));
    } else {
      item.innerHTML = `
        <div class="song-number" style="color:rgba(155,112,128,0.4)">${slot}</div>
        <div class="song-item-emoji" style="opacity:0.3">&#128274;</div>
        <div class="song-item-info">
          <div class="song-item-title" style="color:rgba(155,112,128,0.5)">Pronto...</div>
          <div class="song-item-artist" style="opacity:0.4">Cancion no revelada</div>
        </div>
        <div class="song-fire-display">${buildFlamesLocked(flames)}</div>`;
    }

    list.appendChild(item);
  });
}

function buildFlames(count) {
  let html = '<div class="song-fire-display">';
  for (let i = 0; i < count; i++) {
    html += `<span class="fire-flame">&#128293;</span>`;
  }
  html += "</div>";
  return html;
}

function buildFlamesLocked(count) {
  let html = '<div class="song-fire-display" style="opacity:0.2">';
  for (let i = 0; i < count; i++) {
    html += `<span>&#128293;</span>`;
  }
  html += "</div>";
  return html;
}

/* ───────────────────────────────────────────────────────── */
/*  4. MODAL DE CANCIÓN                                      */
/* ───────────────────────────────────────────────────────── */
function openSongModal(slot) {
  const song = songsData[slot];
  if (!song) return;

  currentOpenSlot = slot;

  document.getElementById("songModalEmoji").textContent  = song.emoji || "🎵";
  document.getElementById("songModalTitle").textContent  = song.title  || "";
  document.getElementById("songModalArtist").textContent = song.artist || "";
  document.getElementById("songModalDedication").textContent = song.dedication || "";
  
  const link = song.link || "";
  const iframe = document.getElementById("songModalIframe");
  const playerDiv = document.getElementById("songModalPlayer");

  if (link) {
    playerDiv.style.display = "block";
    iframe.src = getEmbedUrl(link);
  } else {
    playerDiv.style.display = "none";
    iframe.src = "";
  }

  renderReactionsDisplay(slot);
  resetReactionButtons();

  // Mostrar reacciones solo para viewer (Yen) o ambos
  document.getElementById("songReactions").style.display = "block";

  document.getElementById("songModal").classList.remove("hidden");

  // Si es la canción 1 (especial), mostrar overlay especial PRIMERO
  if (slot === "1") {
    showSpecialOverlay();
  }
}

document.getElementById("songModalClose").addEventListener("click", closeSongModal);
document.getElementById("songModalOverlay").addEventListener("click", closeSongModal);

function closeSongModal() {
  document.getElementById("songModal").classList.add("hidden");
  // Detener el audio quitando el src del iframe
  document.getElementById("songModalIframe").src = "";
  currentOpenSlot = null;
}

// Convertir links a embeds
function getEmbedUrl(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("spotify.com")) {
      // https://open.spotify.com/track/123 -> https://open.spotify.com/embed/track/123
      if (!urlObj.pathname.includes("/embed/")) {
        const parts = urlObj.pathname.split("/").filter(p => p);
        if (parts.length >= 2) {
          return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}?utm_source=generator`;
        }
      }
    } else if (urlObj.hostname.includes("youtube.com") || urlObj.hostname.includes("youtu.be")) {
      let videoId = "";
      if (urlObj.hostname.includes("youtu.be")) {
        videoId = urlObj.pathname.substring(1);
      } else if (urlObj.searchParams.has("v")) {
        videoId = urlObj.searchParams.get("v");
      }
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
    }
  } catch(e) {}
  return url;
}

/* ───────────────────────────────────────────────────────── */
/*  5. REACCIONES                                            */
/* ───────────────────────────────────────────────────────── */
document.getElementById("reactionsGrid").addEventListener("click", e => {
  const btn = e.target.closest(".reaction-btn");
  if (!btn || !currentOpenSlot) return;

  const emoji = btn.dataset.emoji;

  // Toggle visual activo
  const allBtns = document.querySelectorAll(".reaction-btn");
  const wasActive = btn.classList.contains("active");
  allBtns.forEach(b => b.classList.remove("active"));

  if (!wasActive) {
    btn.classList.add("active");
    addReaction(currentOpenSlot, emoji);
  }
});

async function addReaction(slot, emoji) {
  const ref = db.collection("reactions").doc(slot);
  try {
    await ref.set({
      [emoji]: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  } catch (err) {
    console.error("Error guardando reaccion:", err);
  }
}

function renderReactionsDisplay(slot) {
  const display = document.getElementById("reactionsDisplay");
  if (!display) return;

  const data = reactionsData[slot] || {};
  const entries = Object.entries(data).filter(([_, count]) => count > 0);

  if (entries.length === 0) {
    display.innerHTML = "";
    return;
  }

  display.innerHTML = entries
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => `
      <div class="reaction-count-badge">
        <span>${emoji}</span>
        <span>${count}</span>
      </div>`)
    .join("");
}

function resetReactionButtons() {
  document.querySelectorAll(".reaction-btn").forEach(b => b.classList.remove("active"));
}

/* ───────────────────────────────────────────────────────── */
/*  6. PANEL ADMIN                                           */
/* ───────────────────────────────────────────────────────── */
let adminPanelOpen = false;
document.getElementById("adminPanelBtn").addEventListener("click", () => {
  const panel = document.getElementById("adminPanel");
  adminPanelOpen = !adminPanelOpen;
  if (adminPanelOpen) {
    panel.classList.remove("hidden");
    loadAdminForm(document.getElementById("adminSlot").value);
  } else {
    panel.classList.add("hidden");
  }
});

// Cambiar slot en admin: cargar info de la cancion si ya existe
document.getElementById("adminSlot").addEventListener("change", function() {
  loadAdminForm(this.value);
});

function loadAdminForm(slot) {
  clearAdminForm();
  const song = songsData[slot];
  const deleteBtn = document.getElementById("adminDeleteBtn");
  
  if (song) {
    document.getElementById("adminSongTitle").value = song.title || "";
    document.getElementById("adminSongArtist").value = song.artist || "";
    document.getElementById("adminSongLink").value = song.link || "";
    document.getElementById("adminSongDedication").value = song.dedication || "";
    document.getElementById("adminSongCarta").value = song.carta || "";
    document.getElementById("adminSongEmoji").value = song.emoji || "\uD83C\uDFB5";
    deleteBtn.classList.remove("hidden");

    if (slot === "oursong" && song.photoUrl) {
      document.getElementById("adminPhotoPreview").innerHTML = `<img src="${song.photoUrl}" alt="Portada">`;
    }
  } else {
    deleteBtn.classList.add("hidden");
  }
}

// Preview y compresión de foto a Base64
let selectedPhotoBase64 = null;
document.getElementById("adminSongPhoto").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      // Comprimir con Canvas para evitar límite de 1MB de Firestore
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 800;
      
      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      
      selectedPhotoBase64 = canvas.toDataURL("image/jpeg", 0.6);
      document.getElementById("adminPhotoPreview").innerHTML = `<img src="${selectedPhotoBase64}" alt="Preview">`;
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

// Eliminar
document.getElementById("adminDeleteBtn").addEventListener("click", async () => {
  const slot = document.getElementById("adminSlot").value;
  if (!confirm("\u00BFEstas seguro de eliminar esta cancion?")) return;

  try {
    await db.collection("songs").doc(slot).delete();
    clearAdminForm();
    document.getElementById("adminPanel").classList.add("hidden");
    adminPanelOpen = false;
    showToast("Cancion eliminada");
  } catch (err) {
    console.error("Error al eliminar", err);
    alert("Error al eliminar.");
  }
});

document.getElementById("adminCancelBtn").addEventListener("click", () => {
  document.getElementById("adminPanel").classList.add("hidden");
  adminPanelOpen = false;
  clearAdminForm();
});

document.getElementById("adminSaveBtn").addEventListener("click", saveSong);

async function saveSong() {
  const slot       = document.getElementById("adminSlot").value;
  const title      = document.getElementById("adminSongTitle").value.trim();
  const artist     = document.getElementById("adminSongArtist").value.trim();
  const link       = document.getElementById("adminSongLink").value.trim();
  const dedication = document.getElementById("adminSongDedication").value.trim();
  const carta      = document.getElementById("adminSongCarta").value.trim();
  const emoji      = document.getElementById("adminSongEmoji").value.trim() || "\uD83C\uDFB5";

  if (!title || !link) {
    alert("Por favor completa al menos el titulo y el link.");
    return;
  }

  const btn = document.getElementById("adminSaveBtn");
  btn.textContent = "Guardando...";
  btn.disabled = true;

  try {
    let photoUrl = songsData[slot] ? songsData[slot].photoUrl : null;

    if (slot === "oursong" && selectedPhotoBase64) {
      photoUrl = selectedPhotoBase64;
    }

    await db.collection("songs").doc(slot).set({
      slot,
      title,
      artist,
      link,
      dedication,
      carta,
      emoji,
      photoUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    clearAdminForm();
    document.getElementById("adminPanel").classList.add("hidden");
    adminPanelOpen = false;
    showToast("\u{1F3B5} Cancion guardada con exito!");
  } catch (err) {
    console.error("Error guardando cancion:", err);
    alert("Error al guardar. Intenta de nuevo.");
  } finally {
    btn.textContent = "Guardar Cancion";
    btn.disabled = false;
  }
}

function clearAdminForm() {
  document.getElementById("adminSongTitle").value = "";
  document.getElementById("adminSongArtist").value = "";
  document.getElementById("adminSongLink").value = "";
  document.getElementById("adminSongDedication").value = "";
  document.getElementById("adminSongCarta").value = "";
  document.getElementById("adminSongEmoji").value = "\uD83C\uDFB5";
  document.getElementById("adminSongPhoto").value = "";
  document.getElementById("adminPhotoPreview").innerHTML = "";
  selectedPhotoBase64 = null;
  document.getElementById("adminDeleteBtn").classList.add("hidden");
}

/* ───────────────────────────────────────────────────────── */
/*  7. OVERLAY ESPECIAL (Canción 1 — Pedida de novia)        */
/* ───────────────────────────────────────────────────────── */
function showSpecialOverlay() {
  const overlay = document.getElementById("specialOverlay");
  overlay.classList.remove("hidden");

  // Crear partículas de fuego
  spawnFireParticles();
  // Crear lluvia de corazones
  spawnHearts();
}

document.getElementById("specialContinueBtn").addEventListener("click", () => {
  const overlay = document.getElementById("specialOverlay");
  overlay.style.animation = "fadeOutSpecial 0.8s ease forwards";
  setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.style.animation = "";
    document.getElementById("specialBgFire").innerHTML = "";
    document.getElementById("heartsRain").innerHTML = "";
    // Mostrar la carta
    showLetterOverlay();
  }, 800);
});

// Añadir keyframe fadeOut dinámicamente
const styleEl = document.createElement("style");
styleEl.textContent = `
  @keyframes fadeOutSpecial {
    from { opacity: 1; }
    to   { opacity: 0; transform: scale(1.05); }
  }
`;
document.head.appendChild(styleEl);

function spawnFireParticles() {
  const container = document.getElementById("specialBgFire");
  container.innerHTML = "";

  const colors = [
    "#FF1500","#FF4500","#FF6B00","#FF8C00",
    "#FFA500","#FFB700","#FFD700","#FFF44F"
  ];

  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");
    p.className = "fire-particle";
    const size  = Math.random() * 30 + 10;
    const left  = Math.random() * 100;
    const dur   = Math.random() * 3 + 1.5;
    const delay = Math.random() * 4;
    const color = colors[Math.floor(Math.random() * colors.length)];

    p.style.cssText = `
      width: ${size}px;
      height: ${size * 1.5}px;
      left: ${left}%;
      background: radial-gradient(ellipse at bottom, ${color}, transparent 80%);
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
      filter: blur(${Math.random() * 3}px);
      opacity: ${Math.random() * 0.6 + 0.4};
    `;
    container.appendChild(p);
  }
}

function spawnHearts() {
  const container = document.getElementById("heartsRain");
  container.innerHTML = "";
  const hearts = ["&#10084;&#65039;","&#128149;","&#128150;","&#128151;","&#128147;","&#129505;"];

  for (let i = 0; i < 30; i++) {
    const h = document.createElement("div");
    h.className = "heart-drop";
    const left  = Math.random() * 100;
    const dur   = Math.random() * 5 + 4;
    const delay = Math.random() * 6;
    const size  = Math.random() * 20 + 12;
    h.style.cssText = `
      left: ${left}%;
      font-size: ${size}px;
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
    `;
    h.innerHTML = hearts[Math.floor(Math.random() * hearts.length)];
    container.appendChild(h);
  }
}

/* ───────────────────────────────────────────────────────── */
/*  8. TOAST                                                 */
/* ───────────────────────────────────────────────────────── */
function showToast(msg) {
  let t = document.getElementById("songToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "songToast";
    t.style.cssText = `
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
      background:linear-gradient(135deg,#E8547A,#C03060);
      color:white;padding:13px 28px;border-radius:100px;font-weight:600;
      font-size:0.95rem;z-index:9999;opacity:0;
      transition:opacity 0.3s ease;box-shadow:0 8px 30px rgba(232,84,122,0.4);
      pointer-events:none;white-space:nowrap;
    `;
    document.body.appendChild(t);
  }
  t.innerHTML = msg;
  t.style.opacity = "1";
  setTimeout(() => { t.style.opacity = "0"; }, 3000);
}

/* ───────────────────────────────────────────────────────── */
/*  9. CARTA ANIMADA — sobre que se abre                     */
/* ───────────────────────────────────────────────────────── */
function showLetterOverlay() {
  const song = songsData["1"];
  const cartaText = (song && song.carta) ? song.carta : "";

  if (!cartaText) {
    // Sin carta, abrimos directo el modal de cancion
    return;
  }

  const letterOverlay = document.getElementById("letterOverlay");
  const envelope      = document.getElementById("envelope");
  const letterPaper   = document.getElementById("letterPaper");
  const letterBody    = document.getElementById("letterBody");
  const letterFirma   = document.querySelector(".letter-firma");
  const closeBtn      = document.getElementById("letterCloseBtn");

  // Reset estado
  envelope.classList.remove("is-opening", "is-open");
  letterPaper.classList.remove("is-visible");
  letterBody.classList.remove("done");
  letterBody.textContent = "";
  letterFirma.classList.remove("visible");
  closeBtn.classList.remove("visible");

  // Agregar hint de toque
  let existingHint = envelope.querySelector(".envelope-tap-hint");
  if (!existingHint) {
    const hint = document.createElement("div");
    hint.className = "envelope-tap-hint";
    hint.textContent = "✦ Toca para abrir tu carta ✦";
    envelope.appendChild(hint);
  }

  letterOverlay.classList.remove("hidden");

  // Añadir petals decorativos sobre la carta
  spawnLetterPetals();

  // Clic en el sobre → abrir
  envelope.addEventListener("click", onEnvelopeClick, { once: true });

  function onEnvelopeClick() {
    // Remover hint
    const hint = envelope.querySelector(".envelope-tap-hint");
    if (hint) hint.style.opacity = "0";

    // 1. Animacion apertura de solapa
    envelope.classList.add("is-opening");

    setTimeout(() => {
      envelope.classList.add("is-open");
    }, 300);

    // 2. El sobre se eleva y encoge
    setTimeout(() => {
      envelope.style.transition = "transform 0.6s ease, opacity 0.5s ease";
      envelope.style.transform  = "translateY(-30px) scale(0.85)";
      envelope.style.opacity    = "0.7";
    }, 900);

    // 3. La carta emerge
    setTimeout(() => {
      envelope.style.display = "none";
      letterPaper.classList.add("is-visible");

      // Efecto typewriter
      typewriterEffect(letterBody, cartaText, 28, () => {
        letterBody.classList.add("done");
        // Mostrar firma y boton
        setTimeout(() => {
          letterFirma.classList.add("visible");
          closeBtn.classList.add("visible");
        }, 300);
      });
    }, 1400);
  }
}

/* Efecto typewriter: escribe caracter a caracter */
function typewriterEffect(el, text, speed, onDone) {
  let i = 0;
  el.textContent = "";

  function writeChar() {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      // Velocidad variable: mas rapido en espacios, mas lento en puntuacion
      const char = text[i - 1];
      let delay = speed;
      if (char === "." || char === "!" || char === "?") delay = speed * 8;
      else if (char === "," || char === ";") delay = speed * 4;
      else if (char === " ") delay = speed * 0.5;
      else if (char === "\n") delay = speed * 6;
      setTimeout(writeChar, delay);
    } else {
      if (onDone) onDone();
    }
  }
  writeChar();
}

/* Petalos decorativos en la carta */
function spawnLetterPetals() {
  const container = document.getElementById("letterPetals");
  if (!container) return;
  container.innerHTML = "";
  const symbols = ["\u2764", "\uD83C\uDF38", "\u2728", "\uD83C\uDF39", "\u2665"];

  for (let i = 0; i < 10; i++) {
    const p = document.createElement("span");
    p.className = "petal";
    p.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const left  = Math.random() * 100;
    const dur   = Math.random() * 6 + 5;
    const delay = Math.random() * 8;
    p.style.cssText = `
      left: ${left}%;
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
      font-size: ${Math.random() * 10 + 8}px;
    `;
    container.appendChild(p);
  }
}

/* Cerrar carta → ir al modal de cancion */
document.getElementById("letterCloseBtn").addEventListener("click", () => {
  const letterOverlay = document.getElementById("letterOverlay");
  letterOverlay.style.transition = "opacity 0.6s ease";
  letterOverlay.style.opacity = "0";

  // Reset envelope para proxima vez
  const envelope = document.getElementById("envelope");
  envelope.style.display = "";
  envelope.style.transform = "";
  envelope.style.opacity = "";
  envelope.style.transition = "";

  setTimeout(() => {
    letterOverlay.classList.add("hidden");
    letterOverlay.style.opacity = "";
  }, 600);
});

/* ───────────────────────────────────────────────────────── */
/*  10. UTILIDADES                                           */
/* ───────────────────────────────────────────────────────── */
function escHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str || ""));
  return d.innerHTML;
}

/* Mostrar/ocultar campo carta y foto segun slot seleccionado */
document.getElementById("adminSlot").addEventListener("change", function() {
  const cartaField = document.getElementById("adminCartaField");
  const photoField = document.getElementById("adminPhotoField");
  
  if (this.value === "1") {
    cartaField.style.display = "block";
  } else {
    cartaField.style.display = "none";
  }

  if (this.value === "oursong") {
    photoField.style.display = "flex";
  } else {
    photoField.style.display = "none";
  }
});

// Inicialmente visible segun slot seleccionado
(function() {
  const slot = document.getElementById("adminSlot");
  const cartaField = document.getElementById("adminCartaField");
  const photoField = document.getElementById("adminPhotoField");
  
  if (slot && cartaField && photoField) {
    cartaField.style.display = slot.value === "1" ? "block" : "none";
    photoField.style.display = slot.value === "oursong" ? "flex" : "none";
  }
})();
