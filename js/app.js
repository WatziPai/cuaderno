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

// Habilitar persistencia sin conexión ANTES de realizar cualquier consulta
db.enablePersistence().catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("Persistencia de Firestore en múltiples pestañas habilitada parcialmente.");
  } else if (err.code === 'unimplemented') {
    console.warn("El navegador no soporta persistencia en Firestore.");
  }
});

let citas = [];          // array de objetos cita
let citaActivaId = null; // id de la cita abierta en el modal de detalle
let colorSeleccionado = "#f7d9e3";
let fotoActivaIndex = 0; // índice de la foto abierta en el lightbox
let editandoId = null;   // id de la cita que se está editando
let pendingFotoFiles = []; // fotos seleccionadas antes de guardar la cita
let pendingFotoPreviews = []; // base64 previews de las fotos pendientes

// Paginación
const ITEMS_PER_PAGE = 4;
let currentPage = 1;

// Carga inicial rápida desde LocalStorage si existe
try {
  const localData = localStorage.getItem("cuaderno_citas_backup");
  if (localData) {
    citas = JSON.parse(localData);
    renderBoard();
  }
} catch (e) {
  console.warn("No se pudo leer LocalStorage", e);
}

/* ---------- Firebase: Suscripción a cambios ---------- */
const citasCol = db.collection("citas");
citasCol.onSnapshot((snapshot) => {
  citas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  try {
    localStorage.setItem("cuaderno_citas_backup", JSON.stringify(citas));
  } catch (e) {
    // Si excede el espacio de LocalStorage por imágenes grandes
  }
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
}, (error) => {
  console.error("Error en la conexión con Firebase: ", error);
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

  // Más antiguas primero
  const ordenadas = [...citas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  
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
  pendingFotoFiles = [];
  pendingFotoPreviews = [];
  renderPendingPreviews();
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
  btn.disabled = true;

  const nuevaCita = {
    titulo: document.getElementById("citaTitulo").value.trim(),
    fecha: document.getElementById("citaFecha").value,
    lugar: document.getElementById("citaLugar").value.trim(),
    descripcion: document.getElementById("citaDescripcion").value.trim(),
    color: colorSeleccionado
  };

  // Timeout de 15 segundos
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Tiempo de espera agotado. ¿Creaste Firestore Database en la consola de Firebase?")), 15000)
  );

  try {
    if (editandoId) {
      btn.textContent = "Guardando...";
      const citaIndex = citas.findIndex(c => c.id === editandoId);
      const citaActual = citas[citaIndex] || {};
      const fotosExistentes = citaActual.fotos || [];
      
      let nuevasUrls = [];
      if (pendingFotoFiles.length > 0) {
        btn.textContent = "Procesando fotos...";
        nuevasUrls = await subirFotosPendientes(editandoId);
      }

      const fotosFinales = [...fotosExistentes, ...nuevasUrls];
      const citaDataActualizada = { ...nuevaCita, fotos: fotosFinales };

      // Intentar guardar en Firestore
      try {
        await Promise.race([db.collection("citas").doc(editandoId).update(citaDataActualizada), timeout]);
      } catch (errDb) {
        console.warn("Firestore inaccesible. Guardando cambio localmente:", errDb);
        if (citaIndex !== -1) {
          citas[citaIndex] = { id: editandoId, ...citaDataActualizada };
          localStorage.setItem("cuaderno_citas_backup", JSON.stringify(citas));
          renderBoard();
        }
      }
      pendingFotoFiles = [];
      pendingFotoPreviews = [];
    } else {
      const tempId = "local_" + Date.now();
      let nuevasUrls = [];
      if (pendingFotoFiles.length > 0) {
        btn.textContent = "Procesando fotos...";
        nuevasUrls = await subirFotosPendientes(tempId);
      }
      nuevaCita.fotos = nuevasUrls;

      try {
        btn.textContent = "Creando cita...";
        const docRef = await Promise.race([citasCol.add(nuevaCita), timeout]);
        // Si subimos con ID temporal, actualizar si hizo falta
      } catch (errDb) {
        console.warn("Firestore inaccesible. Guardando cita localmente:", errDb);
        citas.push({ id: tempId, ...nuevaCita });
        localStorage.setItem("cuaderno_citas_backup", JSON.stringify(citas));
        renderBoard();
      }
      pendingFotoFiles = [];
      pendingFotoPreviews = [];
      currentPage = 1;
    }
    cerrarModal("citaModal");
  } catch (err) {
    console.error("Error guardando documento: ", err);
    alert("❌ Hubo un inconveniente al guardar la cita.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

/* ---------- Subida de fotos pendientes y fallbacks ---------- */
async function subirUnicaFoto(citaId, archivo, previewBase64) {
  if (previewBase64) return previewBase64;
  return await fileToBase64(archivo);
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    compressImage(file, 1000, 1000, 0.75).then((compressedFile) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(compressedFile);
    });
  });
}

async function subirFotosPendientes(citaId) {
  const promesas = pendingFotoFiles.map((archivo, idx) => {
    const preview = pendingFotoPreviews[idx];
    return subirUnicaFoto(citaId, archivo, preview);
  });
  return await Promise.all(promesas);
}

function renderPendingPreviews() {
  const container = document.getElementById("pendingPhotoPreview");
  if (!container) return;
  container.innerHTML = "";
  pendingFotoPreviews.forEach((src, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "pending-photo-item";
    const img = document.createElement("img");
    img.src = src;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pending-photo-remove";
    btn.innerHTML = "✕";
    btn.title = "Quitar foto";
    btn.addEventListener("click", () => {
      pendingFotoFiles.splice(idx, 1);
      pendingFotoPreviews.splice(idx, 1);
      renderPendingPreviews();
    });
    wrap.appendChild(img);
    wrap.appendChild(btn);
    container.appendChild(wrap);
  });
  container.style.display = pendingFotoPreviews.length > 0 ? "flex" : "none";
}

/* ---------- Compresión de imágenes para móvil y web ---------- */
function compressImage(file, maxWidth = 1600, maxHeight = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name || 'foto.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

const modalPhotoInput = document.getElementById("modalPhotoInput");
modalPhotoInput.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    const compressed = await compressImage(file);
    pendingFotoFiles.push(compressed);
    const reader = new FileReader();
    reader.onload = ev => {
      pendingFotoPreviews.push(ev.target.result);
      renderPendingPreviews();
    };
    reader.readAsDataURL(compressed);
  }
  e.target.value = "";
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

  const label = document.querySelector('label[for="photoInput"]') || document.querySelector(".btn-upload");
  const originalText = label ? label.innerHTML : "Añadir fotos";
  if (label) label.textContent = "⏳ Subiendo fotos...";
  
  try {
    const subidas = archivos.map((archivo) => subirUnicaFoto(cita.id, archivo, null));
    const nuevasUrls = await Promise.all(subidas);
    const urlsValidas = nuevasUrls.filter(u => !!u);

    const fotosActualizadas = [...(cita.fotos || []), ...urlsValidas];
    cita.fotos = fotosActualizadas;

    try {
      await db.collection("citas").doc(cita.id).update({ fotos: fotosActualizadas });
    } catch (err) {
      console.warn("Firestore update falló, guardando localmente:", err);
      try {
        localStorage.setItem("cuaderno_citas_backup", JSON.stringify(citas));
      } catch (e) {}
      renderGaleria(cita);
      renderBoard();
    }
  } catch (err) {
    console.error("Error subiendo fotos:", err);
    alert("Hubo un error al procesar las fotos.");
  } finally {
    if (label) label.innerHTML = originalText;
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

  // Limpiar fotos pendientes
  pendingFotoFiles = [];
  pendingFotoPreviews = [];
  renderPendingPreviews();

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

/* Soporte táctil / swipe en móvil para Lightbox */
let touchStartX = 0;
let touchEndX = 0;

lightbox.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
  }
}, { passive: true });

lightbox.addEventListener("touchend", (e) => {
  if (e.changedTouches.length === 1) {
    touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 40) {
      const cita = citas.find((c) => c.id === citaActivaId);
      if (!cita || !cita.fotos || !cita.fotos.length) return;
      if (diff < 0) {
        fotoActivaIndex = (fotoActivaIndex + 1) % cita.fotos.length;
      } else {
        fotoActivaIndex = (fotoActivaIndex - 1 + cita.fotos.length) % cita.fotos.length;
      }
      actualizarLightbox();
    }
  }
}, { passive: true });

document.getElementById("lightboxDelete").addEventListener("click", async () => {
  const cita = citas.find(c => c.id === citaActivaId);
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

// ---- DESCARGAR FOTO ----
document.getElementById("lightboxDownload").addEventListener("click", async () => {
  const cita = citas.find(c => c.id === citaActivaId);
  if (!cita || !cita.fotos.length) return;
  const url = cita.fotos[fotoActivaIndex];
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `foto_cita_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    window.open(url, '_blank');
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
