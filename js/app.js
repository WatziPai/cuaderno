/* ===========================================================
   Cuaderno de Citas Virtual — lógica principal (Firebase Compat)
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

let citas = [];          // array de objetos cita
let citaActivaId = null; // id de la cita abierta en el modal de detalle
let colorSeleccionado = "#f7d9e3";
let fotoActivaIndex = 0; // índice de la foto abierta en el lightbox
let editandoId = null;   // id de la cita que se está editando

// Paginación
const ITEMS_PER_PAGE = 4;
let currentPage = 1;

/* ---------- Firebase: Suscripción a cambios ---------- */
const citasCol = db.collection("citas");
citasCol.onSnapshot((snapshot) => {
  citas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderBoard();
  
  // Si tenemos un modal de detalle abierto, actualizamos sus datos también
  if (citaActivaId) {
    const citaActualizada = citas.find(c => c.id === citaActivaId);
    if (citaActualizada) {
      renderGaleria(citaActualizada);
      if (!document.getElementById("lightbox").classList.contains("hidden")) {
        actualizarLightbox();
      }
    } else {
      cerrarModal("detailModal");
      document.getElementById("lightbox").classList.add("hidden");
    }
  }
});

/* ---------- Render del tablero principal ---------- */
function renderBoard() {
  const board = document.getElementById("board");
  const emptyState = document.getElementById("emptyState");
  const pagination = document.getElementById("pagination");
  const pageIndicator = document.getElementById("pageIndicator");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");

  board.innerHTML = "";

  if (citas.length === 0) {
    emptyState.style.display = "block";
    pagination.classList.add("hidden");
    return;
  }
  emptyState.style.display = "none";

  // Más recientes primero
  const ordenadas = [...citas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  
  // Paginación
  const totalPages = Math.ceil(ordenadas.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginadas = ordenadas.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (totalPages > 1) {
    pagination.classList.remove("hidden");
    pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
  } else {
    pagination.classList.add("hidden");
  }

  paginadas.forEach((cita) => {
    const card = document.createElement("div");
    card.className = "cita-card";
    card.dataset.id = cita.id;

    const portada = document.createElement("div");
    portada.className = "cita-cover";
    portada.style.background = cita.color || "#f7d9e3";

    if (cita.fotos && cita.fotos.length > 0) {
      portada.style.backgroundImage = `url(${cita.fotos[0]})`;
      portada.style.backgroundSize = "cover";
      portada.style.backgroundPosition = "center";
      portada.style.minHeight = "180px";
    } else {
      portada.innerHTML = `<span class="cover-icon">💌</span>`;
    }

    const contador = document.createElement("span");
    contador.className = "cita-photo-count";
    contador.textContent = `📷 ${(cita.fotos || []).length}`;
    portada.appendChild(contador);

    const info = document.createElement("div");
    info.className = "cita-info";
    info.innerHTML = `
      <span class="cita-fecha">${formatearFecha(cita.fecha)}</span>
      <h3>${escapeHTML(cita.titulo)}</h3>
      <span class="cita-lugar">${cita.lugar ? "📍 " + escapeHTML(cita.lugar) : ""}</span>
    `;

    card.appendChild(portada);
    card.appendChild(info);
    card.addEventListener("click", () => abrirDetalle(cita.id));

    board.appendChild(card);
  });
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [y, m, d] = fechaStr.split("-");
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${meses[parseInt(m,10)-1]} ${y}`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ---------- Eventos de Paginación ---------- */
document.getElementById("prevPageBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderBoard();
  }
});

document.getElementById("nextPageBtn").addEventListener("click", () => {
  const totalPages = Math.ceil(citas.length / ITEMS_PER_PAGE);
  if (currentPage < totalPages) {
    currentPage++;
    renderBoard();
  }
});

/* ---------- Modal: crear/editar cita ---------- */
const citaModal = document.getElementById("citaModal");
const citaForm = document.getElementById("citaForm");
const colorPicker = document.getElementById("colorPicker");

document.getElementById("addCitaBtn").addEventListener("click", () => {
  editandoId = null;
  citaForm.reset();
  colorSeleccionado = "#f7d9e3";
  marcarColorSeleccionado();
  document.getElementById("citaModalTitle").textContent = "Nueva cita";
  abrirModal("citaModal");
});

colorPicker.addEventListener("click", (e) => {
  if (!e.target.classList.contains("color-dot")) return;
  colorSeleccionado = e.target.dataset.color;
  marcarColorSeleccionado();
});

function marcarColorSeleccionado() {
  [...colorPicker.children].forEach((dot) => {
    dot.classList.toggle("selected", dot.dataset.color === colorSeleccionado);
  });
}
marcarColorSeleccionado();

citaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = "Guardando...";
  btn.disabled = true;

  const nuevaCita = {
    titulo: document.getElementById("citaTitulo").value.trim(),
    fecha: document.getElementById("citaFecha").value,
    lugar: document.getElementById("citaLugar").value.trim(),
    descripcion: document.getElementById("citaDescripcion").value.trim(),
    color: colorSeleccionado
  };

  // Timeout de 10 segundos para evitar que se quede cargando para siempre
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Tiempo de espera agotado. ¿Creaste Firestore Database en la consola de Firebase?")), 10000)
  );

  try {
    if (editandoId) {
      await Promise.race([db.collection("citas").doc(editandoId).update(nuevaCita), timeout]);
    } else {
      nuevaCita.fotos = [];
      await Promise.race([citasCol.add(nuevaCita), timeout]);
      currentPage = 1;
    }
    cerrarModal("citaModal");
  } catch (err) {
    console.error("Error guardando documento: ", err);
    let msg = err.message || String(err);
    if (err.code === 'permission-denied' || msg.includes('permission')) {
      msg = "Permisos denegados en Firebase.\n\nPara solucionarlo:\n1. Ve a console.firebase.google.com -> tu proyecto\n2. Menú izquierdo: Firestore Database -> pestaña REGLAS (Rules)\n3. Cambia la regla por:\n   allow read, write: if true;\n4. Haz clic en 'Publicar' (Publish).";
    }
    alert("❌ Error al guardar:\n\n" + msg);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

/* ---------- Modal: detalle de cita ---------- */
const detailModal = document.getElementById("detailModal");
const photoInput = document.getElementById("photoInput");

function abrirDetalle(id) {
  citaActivaId = id;
  const cita = citas.find((c) => c.id === id);
  if (!cita) return;

  document.getElementById("detailTitulo").textContent = cita.titulo;
  document.getElementById("detailFecha").textContent = "🗓️ " + formatearFecha(cita.fecha);
  document.getElementById("detailLugar").textContent = cita.lugar ? "📍 " + cita.lugar : "";
  document.getElementById("detailDescripcion").textContent = cita.descripcion || "";

  // Colorear el banner con el color de la cita
  const banner = document.getElementById("detailBanner");
  if (banner) {
    banner.style.background = cita.color
      ? `linear-gradient(135deg, ${cita.color} 0%, ${shadeColor(cita.color, -30)} 100%)`
      : '';
  }

  renderGaleria(cita);
  abrirModal("detailModal");
}

function renderGaleria(cita) {
  const gallery = document.getElementById("photoGallery");
  const emptyMsg = document.getElementById("galleryEmpty");
  gallery.innerHTML = "";

  const fotos = cita.fotos || [];
  emptyMsg.style.display = fotos.length === 0 ? "block" : "none";

  fotos.forEach((fotoUrl, idx) => {
    const item = document.createElement("div");
    item.className = "photo-item";
    const img = document.createElement("img");
    img.src = fotoUrl;
    img.loading = "lazy";
    item.appendChild(img);
    item.addEventListener("click", () => abrirLightbox(idx));
    gallery.appendChild(item);
  });
}

photoInput.addEventListener("change", async (e) => {
  const cita = citas.find((c) => c.id === citaActivaId);
  if (!cita) return;

  const archivos = [...e.target.files];
  if (archivos.length === 0) return;

  const label = document.querySelector(".upload-label");
  const originalLabel = label.textContent;
  label.textContent = "⏳ Subiendo fotos...";
  
  try {
    const subidas = archivos.map(async (archivo) => {
      const fileRef = storage.ref(`citas/${cita.id}/${Date.now()}_${archivo.name}`);
      
      const reader = new FileReader();
      const base64Promise = new Promise(resolve => {
        reader.onload = ev => resolve(ev.target.result);
        reader.readAsDataURL(archivo);
      });
      const base64Data = await base64Promise;
      
      await fileRef.putString(base64Data, 'data_url');
      return await fileRef.getDownloadURL();
    });

    const nuevasUrls = await Promise.all(subidas);
    
    await db.collection("citas").doc(cita.id).update({
      fotos: [...(cita.fotos || []), ...nuevasUrls]
    });
    
  } catch (err) {
    console.error("Error subiendo fotos:", err);
    alert("Hubo un error al subir las fotos. Verifica si Storage tiene las reglas de seguridad abiertas.");
  } finally {
    label.textContent = originalLabel;
    photoInput.value = "";
  }
});

document.getElementById("editCitaBtn").addEventListener("click", () => {
  if (!citaActivaId) return;
  const cita = citas.find((c) => c.id === citaActivaId);
  if (!cita) return;

  editandoId = cita.id;
  
  // Llenar formulario
  document.getElementById("citaTitulo").value = cita.titulo || "";
  document.getElementById("citaFecha").value = cita.fecha || "";
  document.getElementById("citaLugar").value = cita.lugar || "";
  document.getElementById("citaDescripcion").value = cita.descripcion || "";
  
  colorSeleccionado = cita.color || "#f7d9e3";
  marcarColorSeleccionado();

  document.getElementById("citaModalTitle").textContent = "Editar cita";
  cerrarModal("detailModal");
  abrirModal("citaModal");
});

document.getElementById("deleteCitaBtn").addEventListener("click", async () => {
  if (!citaActivaId) return;
  if (!confirm("¿Seguro que quieres eliminar esta cita?")) return;
  
  try {
    await db.collection("citas").doc(citaActivaId).delete();
    cerrarModal("detailModal");
  } catch (err) {
    console.error("Error al eliminar", err);
    alert("Error al eliminar la cita");
  }
});

/* ---------- Lightbox ---------- */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");

function abrirLightbox(idx) {
  fotoActivaIndex = idx;
  actualizarLightbox();
  lightbox.classList.remove("hidden");
}

function actualizarLightbox() {
  const cita = citas.find((c) => c.id === citaActivaId);
  if (!cita || !cita.fotos.length) return;
  lightboxImg.src = cita.fotos[fotoActivaIndex];
}

document.querySelector(".lightbox-prev").addEventListener("click", () => {
  const cita = citas.find((c) => c.id === citaActivaId);
  if (!cita) return;
  fotoActivaIndex = (fotoActivaIndex - 1 + cita.fotos.length) % cita.fotos.length;
  actualizarLightbox();
});

document.querySelector(".lightbox-next").addEventListener("click", () => {
  const cita = citas.find((c) => c.id === citaActivaId);
  if (!cita) return;
  fotoActivaIndex = (fotoActivaIndex + 1) % cita.fotos.length;
  actualizarLightbox();
});

document.getElementById("lightboxDelete").addEventListener("click", async () => {
  const cita = citas.find((c) => c.id === citaActivaId);
  if (!cita) return;
  if (!confirm("¿Eliminar esta foto de la cita?")) return;
  
  const urlEliminar = cita.fotos[fotoActivaIndex];
  const nuevasFotos = cita.fotos.filter(url => url !== urlEliminar);
  
  try {
    await db.collection("citas").doc(citaActivaId).update({ fotos: nuevasFotos });
    
    if (nuevasFotos.length === 0) {
      lightbox.classList.add("hidden");
    } else {
      fotoActivaIndex = Math.min(fotoActivaIndex, nuevasFotos.length - 1);
      actualizarLightbox();
    }
  } catch (err) {
    console.error(err);
    alert("Error eliminando foto");
  }
});

document.querySelector(".lightbox-close").addEventListener("click", () => {
  lightbox.classList.add("hidden");
});

/* ---------- Utilidades genéricas de modales ---------- */
function abrirModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function cerrarModal(id) {
  document.getElementById(id).classList.add("hidden");
}

// Función helper para oscurecer/aclarar un color hex
function shadeColor(color, percent) {
  let R = parseInt(color.slice(1,3), 16);
  let G = parseInt(color.slice(3,5), 16);
  let B = parseInt(color.slice(5,7), 16);
  R = Math.max(0, Math.min(255, R + percent));
  G = Math.max(0, Math.min(255, G + percent));
  B = Math.max(0, Math.min(255, B + percent));
  return `#${R.toString(16).padStart(2,'0')}${G.toString(16).padStart(2,'0')}${B.toString(16).padStart(2,'0')}`;
}

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => cerrarModal(el.dataset.close));
});

// Nueva clase de botones de cerrar (SVG, sin data-close)
document.querySelectorAll(".modal-close-btn[data-close]").forEach((el) => {
  el.addEventListener("click", () => cerrarModal(el.dataset.close));
});

[citaModal, detailModal].forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
  lightbox.classList.add("hidden");
});
