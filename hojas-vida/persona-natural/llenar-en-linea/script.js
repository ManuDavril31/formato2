/*
  Guía rápida para ajustar coordenadas y ampliar campos en el PDF

  Sistema de coordenadas (PDFLib / PDF.js):
  - Origen (0,0) en la esquina inferior izquierda de la página.
  - Unidades en puntos tipográficos (pt), 72 pt ≈ 1 pulgada.
  - Y aumenta hacia arriba; X aumenta hacia la derecha.

  Cómo mover un texto:
  - Cambia los valores x,y en page.drawText(... { x, y, size, font }).
  - Si un texto queda muy pegado, sube/baja y(t) o mueve x(t) hacia derecha/izquierda.

  Tablas y filas dinámicas:
  - Usamos una coordenada base Y (baseY) y un "paso" vertical (step) por fila.
  - La fila i se dibuja en y = baseY - (i * step).
  - Aumentar filas: sube MAX_ITEMS (o MAX_IDIOMAS) y asegúrate de que no haya solapes.
  - Si una fila cruza el margen inferior, considera reducir step o mover baseY más arriba.

  Educación superior (hasta 5 filas):
  - baseY = 200, step = 16.
  - Columnas (x en pt):
      modalidad: 70 | semestres: 130 | graduado SI: 183 | graduado NO: 208 |
      título: 225 (size: 7 para caber) | mes: 430 | año: 460 | tarjeta: 505.
  - Para ajustar una columna cambia sus x.

  Idiomas (hasta 2 filas):
  - baseYIdiomas = 72, stepIdiomas = 17 (segunda fila en y ≈ 55).
  - Columnas (x en pt): idioma: 160 |
      habla: REGULAR 305, BIEN 320, MUY BIEN 338 |
      lee:   REGULAR 355, BIEN 370, MUY BIEN 388 |
      escribe: REGULAR 405, BIEN 422, MUY BIEN 440.

  Consejos prácticos:
  - Usa la vista previa del canvas en escritorio para iterar rápido.
  - Para textos largos (p.ej. títulos), reduce size (7–9) o abrevia.
  - Si necesitas otra página, crea una nueva en pdfDoc y dibuja allí (no implementado aún).
*/

// Guarda la última URL del PDF generado para poder revocarla y evitar fugas
let _lastPdfUrl = null;
// Página activa (1..3) para vista previa y overlay
let _currentPreviewPage = 1;
// Índice de la página 2 actual (0 para la original, 1+ para extras)
let _currentPage2Index = 0;
// Lista de IDs de paneles de página 2 adicionales
let _extraPage2Ids = [];

// --- OPTIMIZACIÓN: CACHE DE PDF ---
let basePagesCache = []; // Array de { canvas, width, height }
let isPdfBaseLoaded = false;
const CACHE_SCALE = 1.6; // Escala base para alta resolución en la cache
// Helper seguro para cadenas en drawText
const s = (v) => (v == null ? "" : typeof v === "string" ? v : String(v));
// Elementos relacionados con nacionalidad/pais: se manejan fuera del submit
const nacionalidad = document.getElementById("nacionalidad");
const campoPais = document.getElementById("campoPais");
const paisInput = document.getElementById("pais");

// --- PERSISTENCIA DE DATOS CON INDEXEDDB (con fallback a localStorage) ---
const STORAGE_KEY = "formatounico_form_data";
const DB_NAME = "FormatoUnicoDb";
const DB_VERSION = 1;
const FORMS_STORE = "forms";
const PDFS_STORE = "pdfs";

// Inicializar IndexedDB
let _db = null;
async function initDb() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FORMS_STORE)) {
        db.createObjectStore(FORMS_STORE, { keyPath: "timestamp" });
      }
      if (!db.objectStoreNames.contains(PDFS_STORE)) {
        db.createObjectStore(PDFS_STORE, { keyPath: "reference" });
      }
    };
  });
}

// Guardar datos del formulario en IndexedDB (primario) con fallback a localStorage
async function saveFormDataToStorage(formData = null) {
  try {
    if (!formData) {
      formData = {};
      document.querySelectorAll("#formulario input, #formulario select, #formulario textarea").forEach((el) => {
        if (el.id) {
          if (el.type === "checkbox" || el.type === "radio") {
            formData[el.id] = el.checked;
          } else {
            formData[el.id] = el.value;
          }
        }
      });
    }

    // Guardar bloques dinámicos de educación
    const eduContainer = document.getElementById("eduContainer");
    if (eduContainer) {
      const eduBlocks = [];
      eduContainer.querySelectorAll(".edu-block").forEach((block) => {
        const blockData = {};
        block.querySelectorAll("input, select").forEach((el) => {
          const key = el.name || el.id;
          if (key) {
            blockData[key] = el.value;
          }
        });
        if (Object.keys(blockData).length > 0) {
          eduBlocks.push(blockData);
        }
      });
      if (eduBlocks.length > 0) {
        formData._eduBlocks = eduBlocks;
      }
    }

    // Guardar bloques dinámicos de idiomas
    const idiomasContainer = document.getElementById("idiomasContainer");
    if (idiomasContainer) {
      const idiomaBlocks = [];
      idiomasContainer.querySelectorAll(".idioma-block").forEach((block) => {
        const blockData = {};
        block.querySelectorAll("input, select").forEach((el) => {
          const key = el.name || el.id;
          if (key) {
            blockData[key] = el.value;
          }
        });
        if (Object.keys(blockData).length > 0) {
          idiomaBlocks.push(blockData);
        }
      });
      if (idiomaBlocks.length > 0) {
        formData._idiomaBlocks = idiomaBlocks;
      }
    }

    // Guardar bloques dinámicos de experiencia laboral
    const expContainer = document.getElementById("expContainer");
    if (expContainer) {
      const expBlocks = [];
      expContainer.querySelectorAll(".exp-block").forEach((block) => {
        const blockData = {};
        block.querySelectorAll("input, select").forEach((el) => {
          const key = el.name || el.id;
          if (key) {
            blockData[key] = el.value;
          }
        });
        if (Object.keys(blockData).length > 0) {
          expBlocks.push(blockData);
        }
      });
      if (expBlocks.length > 0) {
        formData._expBlocks = expBlocks;
      }
    }

    // Guardar paneles de Página 2 adicionales
    if (_extraPage2Ids.length > 0) {
      formData._extraPage2Ids = _extraPage2Ids;
      formData._extraExpBlocks = [];
      _extraPage2Ids.forEach((panelId, idx) => {
        const container = document.getElementById(`expContainer-ext-${idx}`);
        if (container) {
          const blocks = [];
          container.querySelectorAll(".exp-block").forEach((block) => {
            const blockData = {};
            block.querySelectorAll("input, select").forEach((el) => {
              const key = el.name || el.id;
              if (key) {
                blockData[key] = el.value;
              }
            });
            blocks.push(blockData);
          });
          formData._extraExpBlocks.push(blocks);
        }
      });
    }

    const record = {
      timestamp: Date.now(),
      data: formData,
    };

    // Intentar guardar en IndexedDB
    try {
      const db = await initDb();
      const tx = db.transaction(FORMS_STORE, "readwrite");
      const store = tx.objectStore(FORMS_STORE);
      store.clear();
      store.add(record);
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      // Si IndexedDB funciona, también guardar en localStorage como respaldo
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      return true;
    } catch (e) {
      console.warn("IndexedDB no disponible, usando localStorage:", e);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      return true;
    }
  } catch (e) {
    console.warn("No se pudo guardar datos:", e);
    return false;
  }
}

// Recuperar datos del formulario desde IndexedDB (primario) o localStorage
async function restoreFormDataFromStorage() {
  try {
    let formData = null;

    // Intentar recuperar de IndexedDB
    try {
      const db = await initDb();
      const tx = db.transaction(FORMS_STORE, "readonly");
      const store = tx.objectStore(FORMS_STORE);
      const req = store.getAll();

      await new Promise((res, rej) => {
        req.onsuccess = res;
        req.onerror = () => rej(req.error);
      });

      if (req.result && req.result.length > 0) {
        formData = req.result[0].data;
      }
    } catch (e) {
      console.warn("No se pudo leer de IndexedDB, intentando localStorage:", e);
    }

    // Fallback a localStorage
    if (!formData) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        formData = JSON.parse(saved);
      }
    }

    if (!formData) return;

    // Restaurar valores en el formulario
    Object.entries(formData).forEach(([id, value]) => {
      if (id.startsWith("_")) return; // Ignorar datos de bloques dinámicos por ahora
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = value;
      } else {
        el.value = value;
      }
    });

    // Restaurar bloques de educación
    if (formData._eduBlocks && Array.isArray(formData._eduBlocks) && formData._eduBlocks.length > 0) {
      setTimeout(() => {
        const eduContainer = document.getElementById("eduContainer");
        if (eduContainer) {
          // Acceder a la función createEduBlock si está disponible
          // Primero limpiar bloques existentes
          eduContainer.querySelectorAll(".edu-block").forEach(b => b.remove());

          // Restaurar usando el mismo mecanismo que addEdu pero sin animar
          formData._eduBlocks.forEach((blockData, idx) => {
            // Crear el bloque manualmente con los datos
            const idPrefix = `edu-${idx}`;
            const wrap = document.createElement("details");
            wrap.className = "edu-block";
            wrap.open = true;
            wrap.dataset.index = String(idx);
            wrap.id = `${idPrefix}-block`;

            wrap.innerHTML = `
              <summary class="edu-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
                <span class="chev" aria-hidden="true">▸</span>
                <strong id="${idPrefix}-title">Estudio ${idx + 1}</strong>
              </summary>
              <div class="edu-actions" style="display:flex; justify-content:flex-end; margin:4px 0;">
                <button type="button" class="remove-edu" aria-label="Eliminar estudio" title="Eliminar" aria-describedby="${idPrefix}-title">✕</button>
              </div>
              <div class="form-grid edu-content" id="${idPrefix}-content" aria-labelledby="${idPrefix}-title">
                <div>
                  <label for="${idPrefix}-modalidad">Modalidad Académica:</label>
                  <select class="modalidad" id="${idPrefix}-modalidad" name="${idPrefix}-modalidad">
                    <option value="">Seleccionar...</option>
                    <option value="TC">TC: Técnica</option>
                    <option value="TL">TL: Tecnológica</option>
                    <option value="TE">TE: Tecnológica Especializada</option>
                    <option value="UN">UN: Universitaria</option>
                    <option value="ES">ES: Especialización</option>
                    <option value="MG">MG: Maestría / Magíster</option>
                    <option value="DOC">DOC: Doctorado / PHD</option>
                  </select>
                </div>
                <div>
                  <label for="${idPrefix}-semestres">Semestres aprobados:</label>
                  <input type="text" class="semestres" id="${idPrefix}-semestres" name="${idPrefix}-semestres" />
                </div>
                <div>
                  <label for="${idPrefix}-graduado">¿Graduado/a?</label>
                  <select class="graduado" id="${idPrefix}-graduado" name="${idPrefix}-graduado">
                    <option value="">Seleccionar...</option>
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                  </select>
                </div>
                <div>
                  <label for="${idPrefix}-titulo">Título obtenido:</label>
                  <input type="text" class="titulo" id="${idPrefix}-titulo" name="${idPrefix}-titulo" />
                </div>
                <div>
                  <label for="${idPrefix}-fecha">Fecha de grado:</label>
                  <input type="date" class="fecha" id="${idPrefix}-fecha" name="${idPrefix}-fecha" />
                </div>
                <div>
                  <label for="${idPrefix}-tarjeta">Tarjeta profesional (si aplica):</label>
                  <input type="text" class="tarjeta" id="${idPrefix}-tarjeta" name="${idPrefix}-tarjeta" />
                </div>
              </div>
            `;

            eduContainer.appendChild(wrap);

            // Envolver inputs de texto con botones de limpiar
            setupClearButtonsForDynamicInputs(wrap);

            // Restaurar valores
            Object.entries(blockData).forEach(([key, val]) => {
              const input = wrap.querySelector(`[name="${key}"]`) || wrap.querySelector(`#${key}`);
              if (input) {
                input.value = val;
              }
            });

            // Agregar listeners
            wrap.querySelectorAll("input, select").forEach((el) => {
              el.addEventListener("input", (e) => {
                debouncedUpdate(e);
                saveFormDataToStorage();
              });
              el.addEventListener("change", (e) => {
                debouncedUpdate(e);
                saveFormDataToStorage();
              });
            });

            // Agregar listener al botón de eliminar
            wrap.querySelector(".remove-edu")?.addEventListener("click", function (e) {
              e.preventDefault();
              wrap.remove();
              Array.from(eduContainer.querySelectorAll(".edu-block")).forEach((b, i) => {
                b.dataset.index = String(i);
                const title = b.querySelector(".edu-header strong");
                if (title) title.textContent = `Estudio ${i + 1}`;
              });
              document.getElementById("addEducacionBtn").disabled = eduContainer.querySelectorAll(".edu-block").length >= 5;
              debouncedUpdate();
              saveFormDataToStorage();
            });
          });
        }
      }, 150);
    }

    // Restaurar bloques de idiomas
    if (formData._idiomaBlocks && Array.isArray(formData._idiomaBlocks) && formData._idiomaBlocks.length > 0) {
      setTimeout(() => {
        const idiomasContainer = document.getElementById("idiomasContainer");
        if (idiomasContainer) {
          // Limpiar bloques existentes
          idiomasContainer.querySelectorAll(".idioma-block").forEach(b => b.remove());

          // Restaurar bloques
          formData._idiomaBlocks.forEach((blockData, idx) => {
            const idPrefix = `idioma-${idx}`;
            const wrap = document.createElement("details");
            wrap.className = "idioma-block";
            wrap.open = true;
            wrap.dataset.index = String(idx);
            wrap.id = `${idPrefix}-block`;

            wrap.innerHTML = `
              <summary class="idioma-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
                <span class="chev" aria-hidden="true">▸</span>
                <strong id="${idPrefix}-title">Idioma ${idx + 1}</strong>
              </summary>
              <div class="idioma-actions" style="display:flex; justify-content:flex-end; margin:4px 0;">
                <button type="button" class="remove-idioma" aria-label="Eliminar idioma" title="Eliminar" aria-describedby="${idPrefix}-title">✕</button>
              </div>
              <div class="form-grid idioma-content" id="${idPrefix}-content" aria-labelledby="${idPrefix}-title">
                <div>
                  <label for="${idPrefix}-nombre">Idioma:</label>
                  <input type="text" class="idioma-nombre" id="${idPrefix}-nombre" name="${idPrefix}-nombre" />
                </div>
                <div>
                  <label for="${idPrefix}-habla">¿Lo habla?</label>
                  <select class="idioma-habla" id="${idPrefix}-habla" name="${idPrefix}-habla">
                    <option value="">Seleccionar...</option>
                    <option value="REGULAR">Regular</option>
                    <option value="BIEN">Bien</option>
                    <option value="MUYBIEN">Muy bien</option>
                  </select>
                </div>
                <div>
                  <label for="${idPrefix}-lee">¿Lo lee?</label>
                  <select class="idioma-lee" id="${idPrefix}-lee" name="${idPrefix}-lee">
                    <option value="">Seleccionar...</option>
                    <option value="REGULAR">Regular</option>
                    <option value="BIEN">Bien</option>
                    <option value="MUYBIEN">Muy bien</option>
                  </select>
                </div>
                <div>
                  <label for="${idPrefix}-escribe">¿Lo escribe?</label>
                  <select class="idioma-escribe" id="${idPrefix}-escribe" name="${idPrefix}-escribe">
                    <option value="">Seleccionar...</option>
                    <option value="REGULAR">Regular</option>
                    <option value="BIEN">Bien</option>
                    <option value="MUYBIEN">Muy bien</option>
                  </select>
                </div>
              </div>
            `;

            idiomasContainer.appendChild(wrap);

            // Envolver inputs de texto con botones de limpiar
            setupClearButtonsForDynamicInputs(wrap);

            // Restaurar valores
            Object.entries(blockData).forEach(([key, val]) => {
              const input = wrap.querySelector(`[name="${key}"]`) || wrap.querySelector(`#${key}`);
              if (input) {
                input.value = val;
              }
            });

            // Agregar listeners
            wrap.querySelectorAll("input, select").forEach((el) => {
              el.addEventListener("input", (e) => {
                debouncedUpdate(e);
                saveFormDataToStorage();
              });
              el.addEventListener("change", (e) => {
                debouncedUpdate(e);
                saveFormDataToStorage();
              });
            });

            // Agregar listener al botón de eliminar
            wrap.querySelector(".remove-idioma")?.addEventListener("click", function (e) {
              e.preventDefault();
              wrap.remove();
              Array.from(idiomasContainer.querySelectorAll(".idioma-block")).forEach((b, i) => {
                b.dataset.index = String(i);
                const title = b.querySelector(".idioma-header strong");
                if (title) title.textContent = `Idioma ${i + 1}`;
              });
              document.getElementById("addIdiomaBtn").disabled = idiomasContainer.querySelectorAll(".idioma-block").length >= 2;
              debouncedUpdate();
              saveFormDataToStorage();
            });
          });
        }
      }, 150);
    }

    // Restaurar bloques de experiencia laboral
    if (formData._expBlocks && Array.isArray(formData._expBlocks) && formData._expBlocks.length > 0) {
      setTimeout(() => {
        const expContainer = document.getElementById("expContainer");
        if (expContainer) {
          // Limpiar bloques existentes
          expContainer.querySelectorAll(".exp-block").forEach(b => b.remove());

          // Restaurar bloques
          formData._expBlocks.forEach((blockData, idx) => {
            const idPrefix = `exp-${idx}`;
            const wrap = document.createElement("details");
            wrap.className = "exp-block";
            wrap.open = true;
            wrap.dataset.index = String(idx);
            wrap.id = `${idPrefix}-block`;

            wrap.innerHTML = `
              <summary class="exp-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
                <span class="chev" aria-hidden="true">▸</span>
                <strong id="${idPrefix}-title">Experiencia ${idx + 1}</strong>
              </summary>
              <div class="exp-actions" style="display:flex; justify-content:flex-end; margin:4px 0;">
                <button type="button" class="remove-exp" aria-label="Eliminar experiencia" title="Eliminar" aria-describedby="${idPrefix}-title">✕</button>
              </div>
              <div class="form-grid exp-content" id="${idPrefix}-content" aria-labelledby="${idPrefix}-title">
                <div>
                  <label for="${idPrefix}-empresa">Empresa o Entidad:</label>
                  <input type="text" class="empresa" id="${idPrefix}-empresa" name="${idPrefix}-empresa" />
                </div>
                <div>
                  <label for="${idPrefix}-tipo">Tipo de Empresa:</label>
                  <select class="tipoEmpresa" id="${idPrefix}-tipo" name="${idPrefix}-tipo">
                    <option value="">Seleccionar...</option>
                    <option value="PUBLICA">Pública</option>
                    <option value="PRIVADA">Privada</option>
                  </select>
                </div>
                <div>
                  <label for="${idPrefix}-pais">País:</label>
                  <input type="text" class="pais" id="${idPrefix}-pais" name="${idPrefix}-pais" />
                </div>
                <div>
                  <label for="${idPrefix}-depto">Departamento:</label>
                  <input type="text" class="depto" id="${idPrefix}-depto" name="${idPrefix}-depto" />
                </div>
                <div>
                  <label for="${idPrefix}-municipio">Municipio:</label>
                  <input type="text" class="municipio" id="${idPrefix}-municipio" name="${idPrefix}-municipio" />
                </div>
                <div>
                  <label for="${idPrefix}-correo">Correo:</label>
                  <input type="email" class="correo" id="${idPrefix}-correo" name="${idPrefix}-correo" />
                </div>
                <div>
                  <label for="${idPrefix}-telefono">Teléfono:</label>
                  <input type="text" class="telefono" id="${idPrefix}-telefono" name="${idPrefix}-telefono" />
                </div>
                <div>
                  <label for="${idPrefix}-fechaIngreso">Fecha de Ingreso:</label>
                  <input type="date" class="fechaIngreso" id="${idPrefix}-fechaIngreso" name="${idPrefix}-fechaIngreso" />
                </div>
                <div>
                  <label for="${idPrefix}-fechaRetiro">Fecha de Retiro:</label>
                  <input type="date" class="fechaRetiro" id="${idPrefix}-fechaRetiro" name="${idPrefix}-fechaRetiro" />
                </div>
                <div>
                  <label for="${idPrefix}-cargo">Cargo:</label>
                  <input type="text" class="cargo" id="${idPrefix}-cargo" name="${idPrefix}-cargo" />
                </div>
                <div>
                  <label for="${idPrefix}-dependencia">Dependencia:</label>
                  <input type="text" class="dependencia" id="${idPrefix}-dependencia" name="${idPrefix}-dependencia" />
                </div>
                <div>
                  <label for="${idPrefix}-direccion">Dirección:</label>
                  <input type="text" class="direccion" id="${idPrefix}-direccion" name="${idPrefix}-direccion" />
                </div>
              </div>
            `;

            expContainer.appendChild(wrap);

            // Envolver inputs de texto con botones de limpiar
            setupClearButtonsForDynamicInputs(wrap);

            // Restaurar valores
            Object.entries(blockData).forEach(([key, val]) => {
              const input = wrap.querySelector(`[name="${key}"]`) || wrap.querySelector(`#${key}`);
              if (input) {
                input.value = val;
              }
            });

            // Agregar listeners
            wrap.querySelectorAll("input, select").forEach((el) => {
              el.addEventListener("input", (e) => {
                debouncedUpdate(e);
                saveFormDataToStorage();
              });
              el.addEventListener("change", (e) => {
                debouncedUpdate(e);
                saveFormDataToStorage();
              });
            });

            // Agregar listener al botón de eliminar
            wrap.querySelector(".remove-exp")?.addEventListener("click", function (e) {
              e.preventDefault();
              wrap.remove();
              Array.from(expContainer.querySelectorAll(".exp-block")).forEach((b, i) => {
                b.dataset.index = String(i);
                const title = b.querySelector(".exp-header strong");
                if (title) title.textContent = `Experiencia ${i + 1}`;
              });
              debouncedUpdate();
              saveFormDataToStorage();
            });
          });
        }
      }, 150);
    }

    // Restaurar páginas 2 adicionales
    if (formData._extraPage2Ids && Array.isArray(formData._extraPage2Ids)) {
      formData._extraPage2Ids.forEach((panelId, idx) => {
        if (!document.getElementById(panelId)) {
          addExtraPage2();
        }
        // Llenar datos en los bloques de esa página
        if (formData._extraExpBlocks && formData._extraExpBlocks[idx]) {
          const blocksData = formData._extraExpBlocks[idx];
          const container = document.getElementById(`expContainer-ext-${idx}`);
          if (container) {
            // Limpiar iniciales si hay
            container.innerHTML = "";
            blocksData.forEach((bData, bIdx) => {
              // Simular clic en "Añadir experiencia" para este panel
              const addBtn = document.getElementById(`addExpBtn-ext-${idx}`);
              if (addBtn) addBtn.click();

              // Los bloques se añaden asíncronamente o síncronamente?
              // En setupExperienciaLogic, addExp es síncrona.
              const allBlocks = container.querySelectorAll(".exp-block");
              const currentBlock = allBlocks[allBlocks.length - 1];
              if (currentBlock) {
                Object.entries(bData).forEach(([k, v]) => {
                  const input = currentBlock.querySelector(`[name$="-${k}"]`) || currentBlock.querySelector(`.${k}`);
                  if (input) input.value = v;
                });
              }
            });
          }
        }
      });
    }

    // Disparar evento change en trabajaActualmente para actualizar validaciones
    setTimeout(() => {
      const trabajaSel = document.getElementById("trabajaActualmente");
      if (trabajaSel && trabajaSel.value) {
        const event = new Event("change", { bubbles: true });
        trabajaSel.dispatchEvent(event);
      }
      setupTopTabs.init(); // Asegurar que los tabs se inicialicen después de restaurar todo
      setupTopTabs.activate(0); // Empezar en la P1
    }, 300);
  } catch (e) {
    console.warn("No se pudo restaurar datos:", e);
  }
}

// Guardar PDF en IndexedDB con reference (para poder recuperarlo después del pago)
async function savePdfToStorage(pdfBytes, reference) {
  try {
    // Convertir ArrayBuffer a base64 para almacenamiento
    const uint8 = new Uint8Array(pdfBytes);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    const record = {
      reference: reference || "default-" + Date.now(),
      base64: base64,
      timestamp: Date.now(),
      size: pdfBytes.byteLength,
    };

    // Guardar en IndexedDB
    try {
      const db = await initDb();
      const tx = db.transaction(PDFS_STORE, "readwrite");
      const store = tx.objectStore(PDFS_STORE);
      store.put(record);
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) {
      console.warn("IndexedDB no disponible para guardar PDF, usando localStorage:", e);
    }

    // También guardar en localStorage como respaldo con base64
    try {
      localStorage.setItem("pdf_" + record.reference, "data:application/pdf;base64," + base64);
    } catch (e) {
      console.warn("No se pudo guardar PDF en localStorage (posible cuota llena):", e);
    }

    return record.reference;
  } catch (e) {
    console.warn("Error guardando PDF:", e);
    return null;
  }
}

// Recuperar PDF desde IndexedDB o localStorage
async function getPdfFromStorage(reference) {
  try {
    // Intentar recuperar de IndexedDB
    try {
      const db = await initDb();
      const tx = db.transaction(PDFS_STORE, "readonly");
      const store = tx.objectStore(PDFS_STORE);
      const req = store.get(reference);

      await new Promise((res, rej) => {
        req.onsuccess = res;
        req.onerror = () => rej(req.error);
      });

      if (req.result) {
        return req.result;
      }
    } catch (e) {
      console.warn("No se pudo leer PDF de IndexedDB, intentando localStorage:", e);
    }

    // Fallback a localStorage
    const stored = localStorage.getItem("pdf_" + reference);
    if (stored) {
      return {
        reference: reference,
        base64: stored.replace("data:application/pdf;base64,", ""),
        timestamp: Date.now(),
      };
    }

    return null;
  } catch (e) {
    console.warn("Error recuperando PDF:", e);
    return null;
  }
}

// Recuperar datos del formulario para regenerar PDF
async function getFormDataForRegeneration() {
  try {
    let formData = null;

    try {
      const db = await initDb();
      const tx = db.transaction(FORMS_STORE, "readonly");
      const store = tx.objectStore(FORMS_STORE);
      const req = store.getAll();

      await new Promise((res, rej) => {
        req.onsuccess = res;
        req.onerror = () => rej(req.error);
      });

      if (req.result && req.result.length > 0) {
        formData = req.result[0].data;
      }
    } catch (e) {
      console.warn("No se pudo leer de IndexedDB:", e);
    }

    if (!formData) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        formData = JSON.parse(saved);
      }
    }

    return formData;
  } catch (e) {
    console.warn("Error recuperando datos del formulario:", e);
    return null;
  }
}

// Limpiar datos
async function clearFormData() {
  try {
    try {
      const db = await initDb();
      const tx = db.transaction(FORMS_STORE, "readwrite");
      const store = tx.objectStore(FORMS_STORE);
      store.clear();
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) {
      console.warn("No se pudo limpiar IndexedDB:", e);
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("No se pudo limpiar datos:", e);
  }
}

// --- FIN PERSISTENCIA ---

// --- LIMPIAR FORMULARIO ---
function clearAllFormData() {
  const confirmed = confirm("¿Estás seguro de que deseas borrar todos los datos del formulario?");
  if (!confirmed) return;

  // Limpiar todos los inputs, selects y textareas
  document.querySelectorAll("#formulario input, #formulario select, #formulario textarea").forEach((el) => {
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = false;
    } else {
      el.value = "";
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Borrar todos los bloques dinámicos
  document.querySelectorAll(".edu-block").forEach(block => block.remove());
  document.querySelectorAll(".idioma-block").forEach(block => block.remove());
  document.querySelectorAll(".exp-block").forEach(block => block.remove());

  // Limpiar almacenamiento IndexedDB
  if (window.db) {
    try {
      const tx = window.db.transaction(["forms"], "readwrite");
      const store = tx.objectStore("forms");
      store.clear();
    } catch (err) {
      console.warn("No se pudo limpiar IndexedDB:", err);
    }
  }

  // Limpiar localStorage
  try {
    localStorage.removeItem("formData");
  } catch (err) {
    console.warn("No se pudo limpiar localStorage:", err);
  }

  // Limpiar sessionStorage
  clearFormData();

  // Actualizar preview
  updateDesktopPreview();
}

function clearSingleInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.type === "checkbox" || input.type === "radio") {
    input.checked = false;
  } else {
    input.value = "";
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  saveFormDataToStorage();
  updateDesktopPreview();
}

// --- FIN LIMPIAR FORMULARIO ---

// --- Config y helper de marca de agua para canvas de previsualización ---
const WATERMARK_TEXT = "FORMATOUNICO.COM"; // Texto de la marca de agua
const WATERMARK_ALPHA = 0.12; // Opacidad típica de watermark (0.08–0.18)
let WATERMARK_ENABLED = true; // Permite desactivar para depurar orientación y solapes
function drawWatermark(canvas, text = WATERMARK_TEXT) {
  if (!WATERMARK_ENABLED || !canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width || 0;
  const h = canvas.height || 0;
  if (!w || !h) return;
  ctx.save();
  // Tamaño relativo para cubrir en diagonal
  const base = Math.min(w, h);
  const fontSize = Math.max(32, Math.round(base / 8));
  ctx.globalAlpha = WATERMARK_ALPHA;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
  // Repetir varias líneas para cubrir toda la página en diagonal
  const step = Math.round(fontSize * 1.9);
  for (let i = -2; i <= 2; i++) {
    ctx.fillText(text, 0, i * step);
  }
  ctx.restore();
}

function updatePaisVisibility() {
  if (!nacionalidad || !campoPais) return;
  if (nacionalidad.value === "EXTRANJERA") campoPais.style.display = "block";
  else campoPais.style.display = "none";
}

// Lazy-load PDF.js on demand. Returns the pdfjsLib object.
async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.async = true;
    script.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
      } catch (e) {
        console.warn("No se pudo configurar pdf.worker:", e);
      }
      resolve(window.pdfjsLib);
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

// Actualizar visibilidad al cargar y cuando cambie la selección
updatePaisVisibility();
nacionalidad?.addEventListener("change", updatePaisVisibility);

//Elementos relacionados con la fecha de grado de bachillerato
nivelEducativo = document.getElementById("nivelEducativo");
campoTituloBachiller = document.getElementById("campoTituloBachiller");
campoFechaGradoBachiller = document.getElementById("campoFechaGradoBachiller");

function updateFechaGradoVisibility() {
  if (!nivelEducativo || !campoFechaGradoBachiller || !campoTituloBachiller)
    return;
  if (nivelEducativo.value === "11") {
    campoFechaGradoBachiller.style.display = "block";
    campoTituloBachiller.style.display = "block";
  } else {
    campoFechaGradoBachiller.style.display = "none";
    campoTituloBachiller.style.display = "none";
  }
}

// Actualizar visibilidad al cargar y cuando cambie la selección
updateFechaGradoVisibility();
nivelEducativo?.addEventListener("change", updateFechaGradoVisibility);

// Recolectar valores del formulario (en una función para reutilizar)
function collectFormValues() {
  return getFormData();
}

// Construye el PDF y devuelve ArrayBuffer de bytes
// Función principal que construye el PDF usando datos del formulario
async function buildPdfBytes() {
  const v = collectFormValues();
  return buildPdfBytesFromData(v);
}

// Función interna que construye el PDF a partir de datos específicos
async function buildPdfBytesFromData(v) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const s = (val) => (val == null ? "" : String(val));
  const pdfUrl = new URL("./formatounico.pdf", window.location.href).href;
  const existingPdfBytes = await fetch(pdfUrl).then((res) => res.arrayBuffer());

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0, 0, 0);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2Original = pages[1];

  const drawPage1OnPdf = (page, v) => {
    page.drawText(s(v.apellido1).substring(0, 20), { x: 65, y: 605, size: 10, font, color });
    page.drawText(s(v.apellido2).substring(0, 20), { x: 230, y: 605, size: 10, font, color });
    page.drawText(s(v.nombres).substring(0, 30), { x: 400, y: 605, size: 10, font, color });

    if (v.tipoDocumento === "CC") page.drawText("X", { x: 83, y: 574, size: 10, font, color });
    else if (v.tipoDocumento === "CE") page.drawText("X", { x: 113, y: 574, size: 10, font, color });
    else if (v.tipoDocumento === "PA") page.drawText("X", { x: 148, y: 574, size: 10, font, color });
    page.drawText(s(v.documento).substring(0, 15), { x: 185, y: 575, size: 10, font, color });

    if (v.sexo === "M") page.drawText("X", { x: 340, y: 575, size: 10, font, color });
    else if (v.sexo === "F") page.drawText("X", { x: 318, y: 575, size: 10, font, color });

    if (v.nacionalidad === "COLOMBIANA") page.drawText("X", { x: 383, y: 575, size: 10, font, color });
    else if (v.nacionalidad === "EXTRANJERA") {
      page.drawText("X", { x: 457, y: 575, size: 10, font, color });
      page.drawText(s(v.pais).substring(0, 25), { x: 474, y: 575, size: 10, font, color });
    }

    if (v.libretaMilitar === "PRIMERA") page.drawText("X", { x: 146, y: 544, size: 10, font, color });
    else if (v.libretaMilitar === "SEGUNDA") page.drawText("X", { x: 262, y: 544, size: 10, font, color });
    page.drawText(s(v.numeroLibretaMilitar).substring(0, 12), { x: 338, y: 545, size: 10, font, color });
    page.drawText(s(v.distritoMilitar).substring(0, 15), { x: 495, y: 545, size: 10, font, color });

    if (v.fechaNacimiento) {
      const f = new Date(v.fechaNacimiento);
      page.drawText(String(f.getUTCDate()).padStart(2, "0"), { x: 139, y: 508, size: 10, font, color });
      page.drawText(String(f.getUTCMonth() + 1).padStart(2, "0"), { x: 188, y: 508, size: 10, font, color });
      page.drawText(f.getUTCFullYear().toString(), { x: 240, y: 508, size: 10, font, color });
    }

    page.drawText(s(v.paisNacimiento).substring(0, 20), { x: 118, y: 490, size: 10, font, color });
    page.drawText(s(v.deptoNacimiento).substring(0, 20), { x: 118, y: 472, size: 10, font, color });
    page.drawText(s(v.muniNacimiento).substring(0, 20), { x: 118, y: 455, size: 10, font, color });

    page.drawText(s(v.dirCorrespondecia).substring(0, 50), { x: 292, y: 508, size: 10, font, color });
    page.drawText(s(v.paisCorrespondecia).substring(0, 30), { x: 317, y: 490, size: 10, font, color });
    page.drawText(s(v.deptoCorrespondecia).substring(0, 20), { x: 473, y: 490, size: 10, font, color });
    page.drawText(s(v.muniCorrespondecia).substring(0, 20), { x: 344, y: 473, size: 10, font, color });
    page.drawText(s(v.telCorrespondecia).substring(0, 20), { x: 344, y: 455, size: 10, font, color });

    page.drawText(s(v.emailCorrespondecia).substring(0, 35), { x: 473, y: 470, size: 7, font, color });
    page.drawText(s(v.hostEmail).substring(0, 20), { x: 473, y: 455, size: 7, font, color });

    // Nivel educativo
    const mapping = { "1": 103, "2": 120, "3": 137, "4": 154, "5": 171, "6": 188, "7": 205, "8": 223, "9": 240, "10": 257, "11": 274 };
    if (mapping[v.nivelEducativo]) {
      page.drawText("X", { x: mapping[v.nivelEducativo], y: 320, size: 10, font, color });
      if (v.nivelEducativo === "11") {
        page.drawText(s(v.tituloObtenidoBachiller).substring(0, 40), { x: 361, y: 350, size: 9, font, color });
        const f = v.fechaGradoBachiller ? new Date(v.fechaGradoBachiller) : null;
        if (f && !isNaN(f)) {
          page.drawText(String(f.getUTCFullYear()), { x: 418, y: 320, size: 10, font, color });
          page.drawText(String(f.getUTCMonth() + 1).padStart(2, "0"), { x: 353, y: 320, size: 10, font, color });
        }
      }
    }

    // Educación superior
    const edu = (v.educacionSuperior || []).slice(0, 5);
    edu.forEach((it, idx) => {
      const y = 200 - idx * 16;
      page.drawText(s(it.modalidad).substring(0, 25), { x: 70, y, size: 9, font, color });
      page.drawText(s(it.semestres).substring(0, 10), { x: 130, y, size: 9, font, color });
      if (it.graduado === "SI") page.drawText("X", { x: 183, y, size: 10, font, color });
      else if (it.graduado === "NO") page.drawText("X", { x: 208, y, size: 10, font, color });
      page.drawText(s(it.titulo).substring(0, 35), { x: 225, y: y + 1.5, size: 7, font, color });
      if (it.fecha) {
        const f = new Date(it.fecha);
        if (!isNaN(f)) {
          page.drawText(String(f.getUTCMonth() + 1).padStart(2, "0"), { x: 430, y, size: 9, font, color });
          page.drawText(String(f.getUTCFullYear()), { x: 460, y, size: 9, font, color });
        }
      }
      page.drawText(s(it.tarjeta).substring(0, 15), { x: 505, y, size: 9, font, color });
    });

    // Idiomas
    const idiomas = (v.idiomas || []).slice(0, 2);
    idiomas.forEach((it, idx) => {
      const y = 72 - idx * 17;
      page.drawText(s(it.idioma).substring(0, 20), { x: 160, y, size: 9, font, color });
      const map = { habla: [305, 320, 338], lee: [355, 370, 388], escribe: [405, 422, 440] };
      ["habla", "lee", "escribe"].forEach(type => {
        const val = (it[type] || "");
        const xArr = map[type];
        if (val === "REGULAR") page.drawText("X", { x: xArr[0], y, size: 10, font, color });
        else if (val === "BIEN") page.drawText("X", { x: xArr[1], y, size: 10, font, color });
        else if (val === "MUYBIEN") page.drawText("X", { x: xArr[2], y, size: 10, font, color });
      });
    });
  };

  const drawPage2OnPdf = (page, v, page2Index = 0, experienceOffset = 0) => {
    const baseTopY = 552;
    const blockStep = 130;
    const isWorking = v.trabajaActualmente === "SI";
    const startRowOffset = (page2Index === 0 && !isWorking) ? 1 : 0;
    const list = (v.experiencias || []).slice(experienceOffset, experienceOffset + Math.max(0, 4 - startRowOffset));

    list.forEach((e, idx) => {
      const topY = baseTopY - (idx + startRowOffset) * blockStep;
      page.drawText(s(e.empresa).substring(0, 30), { x: 65, y: topY, size: 9, font, color });
      if (e.tipoEmpresa === "PUBLICA") page.drawText("X", { x: 345, y: topY, size: 10, font, color });
      else if (e.tipoEmpresa === "PRIVADA") page.drawText("X", { x: 390, y: topY, size: 10, font, color });
      page.drawText(s(e.pais).substring(0, 20), { x: 425, y: topY, size: 9, font, color });

      const y2 = topY - 30;
      page.drawText(s(e.depto).substring(0, 20), { x: 65, y: y2, size: 9, font, color });
      page.drawText(s(e.municipio).substring(0, 20), { x: 242, y: y2, size: 9, font, color });
      page.drawText(s(e.correo).substring(0, 25), { x: 412, y: y2, size: 6, font, color });

      const y3 = topY - 60;
      page.drawText(s(e.telefono).substring(0, 15), { x: 65, y: y3, size: 9, font, color });
      const drawF = (fechaS, xD, xM, xA) => {
        if (!fechaS) return;
        const f = new Date(fechaS);
        if (isNaN(f)) return;
        page.drawText(String(f.getUTCDate()).padStart(2, "0"), { x: xD, y: y3, size: 9, font, color });
        page.drawText(String(f.getUTCMonth() + 1).padStart(2, "0"), { x: xM, y: y3, size: 9, font, color });
        page.drawText(String(f.getUTCFullYear()), { x: xA, y: y3, size: 9, font, color });
      };
      drawF(e.fechaIngreso, 263, 312, 362);
      drawF(e.fechaRetiro, 430, 479, 529);

      const y4 = topY - 90;
      page.drawText(s(e.cargo).substring(0, 25), { x: 65, y: y4, size: 9, font, color });
      page.drawText(s(e.dependencia).substring(0, 20), { x: 243, y: y4, size: 9, font, color });
      page.drawText(s(e.direccion).substring(0, 25), { x: 410, y: y4, size: 9, font, color });
    });
  };

  const drawPage3OnPdf = (page, v) => {
    const d3 = v.hoja3 || {};
    page.drawText(s(d3.servidorPublicoAnios || "0"), { x: 390, y: 595, size: 10, font, color });
    page.drawText(s(d3.servidorPublicoMeses || "0"), { x: 460, y: 595, size: 10, font, color });
    page.drawText(s(d3.servidorPrivadoAnios || "0"), { x: 390, y: 570, size: 10, font, color });
    page.drawText(s(d3.servidorPrivadoMeses || "0"), { x: 460, y: 570, size: 10, font, color });
    page.drawText(s(d3.trabajadorIndependienteAnios || "0"), { x: 390, y: 545, size: 10, font, color });
    page.drawText(s(d3.trabajadorIndependienteMeses || "0"), { x: 460, y: 545, size: 10, font, color });

    const tm = Number(d3.trabajadorIndependienteMeses || 0) + Number(d3.servidorPublicoMeses || 0) + Number(d3.servidorPrivadoMeses || 0);
    const ta = Number(d3.trabajadorIndependienteAnios || 0) + Number(d3.servidorPublicoAnios || 0) + Number(d3.servidorPrivadoAnios || 0);
    page.drawText(String(ta), { x: 390, y: 516, size: 10, font, color });
    page.drawText(String(tm), { x: 460, y: 516, size: 10, font, color });

    if (d3.Noinhabilidad === "SI") page.drawText("X", { x: 270, y: 420, size: 10, font, color });
    else if (d3.Noinhabilidad === "NO") page.drawText("X", { x: 302, y: 420, size: 10, font, color });

    const fObj = d3.fechaFirma ? new Date(d3.fechaFirma) : new Date();
    const fS = `${String(fObj.getUTCDate()).padStart(2, "0")}/${String(fObj.getUTCMonth() + 1).padStart(2, "0")}/${fObj.getUTCFullYear()}`;
    page.drawText((s(d3.lugarFirma).substring(0, 25) + ", " + fS), { x: 220, y: 338, size: 10, font, color });
  };

  drawPage1OnPdf(page1, v);
  drawPage2OnPdf(page2Original, v, 0, 0);

  const totalExp = (v.experiencias || []).length;
  const isWorking = v.trabajaActualmente === "SI";
  const firstCap = isWorking ? 4 : 3;

  if (totalExp > firstCap) {
    let rem = totalExp - firstCap;
    let p2Idx = 1;
    let currentExpOffset = firstCap;
    while (rem > 0) {
      const [clone] = await pdfDoc.copyPages(pdfDoc, [1]);
      pdfDoc.insertPage(1 + p2Idx, clone);
      drawPage2OnPdf(clone, v, p2Idx, currentExpOffset);
      rem -= 4;
      currentExpOffset += 4;
      p2Idx++;
    }
  }

  const finalP3 = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  drawPage3OnPdf(finalP3, v);

  return await pdfDoc.save();
}

// Renderiza en canvas de escritorio (sin overlay)
let isRenderingDesktop = false;

async function renderDesktop(pdfBytes, pageNum = 1) {
  const canvasDesktop = document.getElementById("pdfCanvasDesktop");
  if (!canvasDesktop) return;

  // Evitar renders simultáneos en el mismo canvas
  if (isRenderingDesktop) {
    if (window._desktopRenderTask && typeof window._desktopRenderTask.cancel === 'function') {
      try { window._desktopRenderTask.cancel(); } catch (_) { }
    }
    return;
  }

  isRenderingDesktop = true;

  const ctxD = canvasDesktop.getContext("2d");
  // Cancelar render anterior si sigue activo para evitar sobreposición/artefactos
  if (window._desktopRenderTask && typeof window._desktopRenderTask.cancel === 'function') {
    try { window._desktopRenderTask.cancel(); } catch (_) { }
  }
  let pdfLibDesk;
  try {
    pdfLibDesk = await ensurePdfJs();
  } catch {
    isRenderingDesktop = false;
    return;
  }
  try {
    const loadingTask = pdfLibDesk.getDocument({ data: pdfBytes });
    const desktopPdf = await loadingTask.promise;
    const safePage = Math.min(Math.max(1, pageNum), desktopPdf.numPages || 1);
    const page1 = await desktopPdf.getPage(safePage);
    // Usamos dontFlip:false para alinear con el sistema del canvas (origen arriba-izquierda)
    const viewport = page1.getViewport({ scale: 1, rotation: 0, dontFlip: false });
    const containerDesktop =
      document.getElementById("previewDesktopContainer") ||
      canvasDesktop.parentElement;
    // Ajustar escala según el alto disponible (sticky container alto viewport)
    const availableH = containerDesktop.clientHeight * window.devicePixelRatio;
    const availableW = containerDesktop.clientWidth * window.devicePixelRatio;
    const scaleByHeight = availableH / viewport.height;
    const scaleByWidth = availableW / viewport.width;
    const scale = Math.min(scaleByHeight, scaleByWidth, 1.5); // límite superior razonable
    const scaledViewport = page1.getViewport({ scale, rotation: 0, dontFlip: false });
    // Asegurar que no queda ninguna transformación previa en el contexto
    try {
      ctxD.setTransform(1, 0, 0, 1, 0, 0);
      ctxD.save();
      ctxD.resetTransform();
      ctxD.clearRect(0, 0, canvasDesktop.width, canvasDesktop.height);
      ctxD.restore();
    } catch { }
    // Asignar dimensiones reales (escala * puntos) y CSS en puntos lógicos
    canvasDesktop.width = Math.round(scaledViewport.width);
    canvasDesktop.height = Math.round(scaledViewport.height);
    canvasDesktop.style.width = Math.round(scaledViewport.width / window.devicePixelRatio) + "px";
    canvasDesktop.style.height = Math.round(scaledViewport.height / window.devicePixelRatio) + "px";
    // Resetear nuevamente antes de renderizar
    try {
      ctxD.setTransform(1, 0, 0, 1, 0, 0);
    } catch { }
    const task = page1.render({ canvasContext: ctxD, viewport: scaledViewport });
    window._desktopRenderTask = task;

    await task.promise;

    // Dibujar marca de agua sobre el render
    drawWatermark(canvasDesktop);
  } catch (e) {
    // Ignorar errores de cancelación y otros errores de renderizado
    if (e?.name === 'RenderingCancelledException') {
      // esperado cuando se cancela el render anterior
      isRenderingDesktop = false;
      return;
    }
    console.error("Error render desktop", e);
  } finally {
    isRenderingDesktop = false;
  }
}

// Debounce helper
function debounce(fn, delay = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Auto update desktop preview
async function initBasePdfCache() {
  if (isPdfBaseLoaded) return;
  try {
    const pdfLib = await ensurePdfJs();
    const pdfBytes = await fetch("formatounico.pdf").then((res) => res.arrayBuffer());
    const pdf = await pdfLib.getDocument({ data: pdfBytes }).promise;

    basePagesCache = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: CACHE_SCALE });

      const offscreen = document.createElement("canvas");
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const oCtx = offscreen.getContext("2d");

      // Fondo blanco
      oCtx.fillStyle = "#fff";
      oCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      await page.render({ canvasContext: oCtx, viewport }).promise;
      basePagesCache.push({ canvas: offscreen, width: viewport.width, height: viewport.height });
    }
    isPdfBaseLoaded = true;
    console.log(`PDF base cacheado con éxito: ${basePagesCache.length} páginas.`);
  } catch (e) {
    console.error("Error cacheando PDF:", e);
  }
}

/**
 * Función central para dibujar los datos sobre el canvas usando solo Canvas API.
 * Reemplaza el re-renderizado total con pdf-lib durante la escritura.
 */
function drawCanvasOverlay(ctx, formData, pageNum, canvasW, canvasH) {
  const scale = canvasW / (basePagesCache[pageNum - 1]?.width / CACHE_SCALE || 595.28);
  const pageH = canvasH;

  // Configuración de fuente base
  ctx.font = `bold ${Math.round(10 * scale)}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";

  const v = formData;
  const s = (val) => (val == null ? "" : String(val));

  if (pageNum === 1) {
    ctx.fillText(s(v.apellido1).substring(0, 20), 65 * scale, pageH - (605 * scale));
    ctx.fillText(s(v.apellido2).substring(0, 20), 230 * scale, pageH - (605 * scale));
    ctx.fillText(s(v.nombres).substring(0, 30), 400 * scale, pageH - (605 * scale));

    if (v.tipoDocumento === "CC") ctx.fillText("X", 83 * scale, pageH - (574 * scale));
    else if (v.tipoDocumento === "CE") ctx.fillText("X", 113 * scale, pageH - (574 * scale));
    else if (v.tipoDocumento === "PA") ctx.fillText("X", 148 * scale, pageH - (574 * scale));
    ctx.fillText(s(v.documento).substring(0, 15), 185 * scale, pageH - (575 * scale));

    if (v.sexo === "M") ctx.fillText("X", 340 * scale, pageH - (575 * scale));
    else if (v.sexo === "F") ctx.fillText("X", 318 * scale, pageH - (575 * scale));

    if (v.nacionalidad === "COLOMBIANA") ctx.fillText("X", 383 * scale, pageH - (575 * scale));
    else if (v.nacionalidad === "EXTRANJERA") {
      ctx.fillText("X", 457 * scale, pageH - (575 * scale));
      if (v.pais) ctx.fillText(s(v.pais).substring(0, 25), 474 * scale, pageH - (575 * scale));
    }

    if (v.libretaMilitar === "PRIMERA") ctx.fillText("X", 146 * scale, pageH - (544 * scale));
    else if (v.libretaMilitar === "SEGUNDA") ctx.fillText("X", 262 * scale, pageH - (544 * scale));
    ctx.fillText(s(v.numeroLibretaMilitar).substring(0, 12), 338 * scale, pageH - (545 * scale));
    ctx.fillText(s(v.distritoMilitar).substring(0, 15), 495 * scale, pageH - (545 * scale));

    if (v.fechaNacimiento) {
      const f = new Date(v.fechaNacimiento);
      const d = String(f.getUTCDate()).padStart(2, "0");
      const m = String(f.getMonth() + 1).padStart(2, "0");
      const a = f.getFullYear();
      ctx.fillText(d, 139 * scale, pageH - (508 * scale));
      ctx.fillText(m, 188 * scale, pageH - (508 * scale));
      ctx.fillText(a.toString(), 240 * scale, pageH - (508 * scale));
    }

    ctx.fillText(s(v.paisNacimiento).substring(0, 20), 118 * scale, pageH - (490 * scale));
    ctx.fillText(s(v.deptoNacimiento).substring(0, 20), 118 * scale, pageH - (472 * scale));
    ctx.fillText(s(v.muniNacimiento).substring(0, 20), 118 * scale, pageH - (455 * scale));

    ctx.fillText(s(v.dirCorrespondecia).substring(0, 50), 292 * scale, pageH - (508 * scale));
    ctx.fillText(s(v.paisCorrespondecia).substring(0, 30), 317 * scale, pageH - (490 * scale));
    ctx.fillText(s(v.deptoCorrespondecia).substring(0, 20), 473 * scale, pageH - (490 * scale));
    ctx.fillText(s(v.muniCorrespondecia).substring(0, 20), 344 * scale, pageH - (473 * scale));
    ctx.fillText(s(v.telCorrespondecia).substring(0, 20), 344 * scale, pageH - (455 * scale));

    const oldFontSmall = ctx.font;
    ctx.font = `bold ${Math.round(7 * scale)}px Helvetica, Arial, sans-serif`;
    ctx.fillText(s(v.emailCorrespondecia).substring(0, 35), 473 * scale, pageH - (470 * scale));
    ctx.fillText(s(v.hostEmail).substring(0, 20), 473 * scale, pageH - (455 * scale));
    ctx.font = oldFontSmall;

    // Nivel educativo
    const mapping = {
      "1": 103, "2": 120, "3": 137, "4": 154, "5": 171,
      "6": 188, "7": 205, "8": 223, "9": 240, "10": 257, "11": 274
    };
    if (mapping[v.nivelEducativo]) {
      ctx.fillText("X", mapping[v.nivelEducativo] * scale, pageH - (320 * scale));
      if (v.nivelEducativo === "11") {
        ctx.fillText(s(v.tituloObtenidoBachiller).substring(0, 40), 361 * scale, pageH - (350 * scale));
        const f = v.fechaGradoBachiller ? new Date(v.fechaGradoBachiller) : null;
        if (f && !isNaN(f)) {
          ctx.fillText(String(f.getUTCFullYear()), 418 * scale, pageH - (320 * scale));
          ctx.fillText(String(f.getUTCMonth() + 1).padStart(2, "0"), 353 * scale, pageH - (320 * scale));
        }
      }
    }

    // Educación superior
    const items = (v.educacionSuperior || []).slice(0, 5);
    let baseY = 200;
    const step = 16;
    items.forEach((it, idx) => {
      const y = baseY - idx * step;
      ctx.fillText(s(it.modalidad).substring(0, 25), 70 * scale, pageH - (y * scale));
      ctx.fillText(s(it.semestres).substring(0, 10), 130 * scale, pageH - (y * scale));
      if (it.graduado === "SI") ctx.fillText("X", 183 * scale, pageH - (y * scale));
      else if (it.graduado === "NO") ctx.fillText("X", 208 * scale, pageH - (y * scale));

      const prevF = ctx.font;
      ctx.font = `bold ${Math.round(7 * scale)}px Helvetica, Arial, sans-serif`;
      ctx.fillText(s(it.titulo).substring(0, 35), 225 * scale, pageH - ((y + 1.5) * scale));
      ctx.font = prevF;

      if (it.fecha) {
        const f = new Date(it.fecha);
        if (!isNaN(f)) {
          ctx.fillText(String(f.getMonth() + 1).padStart(2, "0"), 430 * scale, pageH - (y * scale));
          ctx.fillText(String(f.getFullYear()), 460 * scale, pageH - (y * scale));
        }
      }
      ctx.fillText(s(it.tarjeta).substring(0, 15), 505 * scale, pageH - (y * scale));
    });

    // Idiomas
    const idiomas = (v.idiomas || []).slice(0, 2);
    const baseYI = 72;
    const stepI = 17;
    idiomas.forEach((it, idx) => {
      const y = baseYI - idx * stepI;
      ctx.fillText(s(it.idioma).substring(0, 20), 160 * scale, pageH - (y * scale));
      const mapping = { habla: [305, 320, 338], lee: [355, 370, 388], escribe: [405, 422, 440] };
      ["habla", "lee", "escribe"].forEach(type => {
        const val = (it[type] || "");
        const xArr = mapping[type];
        if (val === "REGULAR") ctx.fillText("X", xArr[0] * scale, pageH - (y * scale));
        else if (val === "BIEN") ctx.fillText("X", xArr[1] * scale, pageH - (y * scale));
        else if (val === "MUYBIEN") ctx.fillText("X", xArr[2] * scale, pageH - (y * scale));
      });
    });
  } else if (pageNum === 2) {
    const baseTopY = 552;
    const blockStep = 130;
    const page2Idx = arguments[5] || 0;
    const isWorking = v.trabajaActualmente === "SI";
    const firstCap = isWorking ? 4 : 3;

    let experienceOffset = 0;
    if (page2Idx > 0) {
      experienceOffset = firstCap + (page2Idx - 1) * 4;
    }
    const effectiveStartRowOffset = (page2Idx === 0 && !isWorking) ? 1 : 0;

    const list = (v.experiencias || []).slice(
      experienceOffset,
      experienceOffset + Math.max(0, 4 - effectiveStartRowOffset)
    );

    list.forEach((e, idx) => {
      const topY = baseTopY - (idx + effectiveStartRowOffset) * blockStep;
      ctx.fillText(s(e.empresa).substring(0, 30), 65 * scale, pageH - (topY * scale));
      if (e.tipoEmpresa === "PUBLICA") ctx.fillText("X", 345 * scale, pageH - (topY * scale));
      else if (e.tipoEmpresa === "PRIVADA") ctx.fillText("X", 390 * scale, pageH - (topY * scale));
      ctx.fillText(s(e.pais).substring(0, 20), 425 * scale, pageH - (topY * scale));

      const y2 = topY - 30;
      ctx.fillText(s(e.depto).substring(0, 20), 65 * scale, pageH - (y2 * scale));
      ctx.fillText(s(e.municipio).substring(0, 20), 242 * scale, pageH - (y2 * scale));
      const oldF = ctx.font;
      ctx.font = `bold ${Math.round(6 * scale)}px Helvetica, Arial, sans-serif`;
      ctx.fillText(s(e.correo).substring(0, 25), 412 * scale, pageH - (y2 * scale));
      ctx.font = oldF;

      const y3 = topY - 60;
      ctx.fillText(s(e.telefono).substring(0, 15), 65 * scale, pageH - (y3 * scale));
      const drawF = (fechaS, xD, xM, xA) => {
        if (!fechaS) return;
        const f = new Date(fechaS);
        if (isNaN(f)) return;
        ctx.fillText(String(f.getUTCDate()).padStart(2, "0"), xD * scale, pageH - (y3 * scale));
        ctx.fillText(String(f.getUTCMonth() + 1).padStart(2, "0"), xM * scale, pageH - (y3 * scale));
        ctx.fillText(String(f.getUTCFullYear()), xA * scale, pageH - (y3 * scale));
      };
      drawF(e.fechaIngreso, 263, 312, 362);
      drawF(e.fechaRetiro, 430, 479, 529);

      const y4 = topY - 90;
      ctx.fillText(s(e.cargo).substring(0, 25), 65 * scale, pageH - (y4 * scale));
      ctx.fillText(s(e.dependencia).substring(0, 20), 243 * scale, pageH - (y4 * scale));
      ctx.fillText(s(e.direccion).substring(0, 25), 410 * scale, pageH - (y4 * scale));
    });
  } else if (pageNum === 3) {
    const d3 = v.hoja3 || {};
    ctx.fillText(s(d3.servidorPublicoAnios), 390 * scale, pageH - (595 * scale));
    ctx.fillText(s(d3.servidorPublicoMeses), 460 * scale, pageH - (595 * scale));
    ctx.fillText(s(d3.servidorPrivadoAnios), 390 * scale, pageH - (570 * scale));
    ctx.fillText(s(d3.servidorPrivadoMeses), 460 * scale, pageH - (570 * scale));
    ctx.fillText(s(d3.trabajadorIndependienteAnios), 390 * scale, pageH - (545 * scale));
    ctx.fillText(s(d3.trabajadorIndependienteMeses), 460 * scale, pageH - (545 * scale));

    const totalMeses = Number(d3.trabajadorIndependienteMeses || 0) + Number(d3.servidorPublicoMeses || 0) + Number(d3.servidorPrivadoMeses || 0);
    const totalAnios = Number(d3.trabajadorIndependienteAnios || 0) + Number(d3.servidorPublicoAnios || 0) + Number(d3.servidorPrivadoAnios || 0);
    ctx.fillText(String(totalAnios), 390 * scale, pageH - (516 * scale));
    ctx.fillText(String(totalMeses), 460 * scale, pageH - (516 * scale));

    if (d3.Noinhabilidad === "SI") ctx.fillText("X", 270 * scale, pageH - (420 * scale));
    else if (d3.Noinhabilidad === "NO") ctx.fillText("X", 302 * scale, pageH - (420 * scale));

    const fechaObj = d3.fechaFirma ? new Date(d3.fechaFirma) : new Date();
    const fS = `${String(fechaObj.getUTCDate()).padStart(2, "0")}/${String(fechaObj.getUTCMonth() + 1).padStart(2, "0")}/${fechaObj.getUTCFullYear()}`;
    ctx.fillText((s(d3.lugarFirma).substring(0, 25) + ", " + fS), 220 * scale, pageH - (338 * scale));
  }
}

async function updateDesktopPreview() {
  if (window.matchMedia("(max-width: 768px)").matches) return; // solo escritorio

  const canvas = document.getElementById("pdfCanvasDesktop");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Si no hay cache, inicializar (solo la primera vez)
  if (!isPdfBaseLoaded) {
    await initBasePdfCache();
  }

  const pageCache = basePagesCache[_currentPreviewPage - 1];
  if (!pageCache) return;

  // 1. Restaurar capa base (PDF)
  // Ajustar dimensiones si es necesario (el canvasDesktop puede cambiar de tamaño por el container)
  const container = document.getElementById("previewDesktopContainer") || canvas.parentElement;
  const availableH = container.clientHeight * window.devicePixelRatio;
  const availableW = container.clientWidth * window.devicePixelRatio;

  const scaleByH = availableH / (pageCache.height / CACHE_SCALE);
  const scaleByW = availableW / (pageCache.width / CACHE_SCALE);
  const currentScale = Math.min(scaleByH, scaleByW, 1.5);

  const finalW = Math.round((pageCache.width / CACHE_SCALE) * currentScale);
  const finalH = Math.round((pageCache.height / CACHE_SCALE) * currentScale);

  if (canvas.width !== finalW || canvas.height !== finalH) {
    canvas.width = finalW;
    canvas.height = finalH;
    canvas.style.width = Math.round(finalW / window.devicePixelRatio) + "px";
    canvas.style.height = Math.round(finalH / window.devicePixelRatio) + "px";
  }

  ctx.drawImage(pageCache.canvas, 0, 0, canvas.width, canvas.height);

  // 2. Capa dinámica: Dibujar texto directamente
  const formData = getFormData(); // Función para obtener datos actuales
  drawCanvasOverlay(ctx, formData, _currentPreviewPage, canvas.width, canvas.height, _currentPage2Index);

  // 3. Marca de agua
  drawWatermark(canvas);
}

function getFormData() {
  const v = {};
  document.querySelectorAll("#formulario input, #formulario select, #formulario textarea").forEach((el) => {
    if (el.id) {
      if (el.type === "checkbox" || el.type === "radio") {
        v[el.id] = el.checked;
      } else {
        v[el.id] = el.value;
      }
    }
  });

  // Educación superior dinámica
  v.educacionSuperior = [];
  const eduContainer = document.getElementById("eduContainer");
  if (eduContainer) {
    eduContainer.querySelectorAll(".edu-block").forEach((block) => {
      v.educacionSuperior.push({
        modalidad: block.querySelector(".modalidad")?.value || "",
        semestres: block.querySelector(".semestres")?.value || "",
        graduado: block.querySelector(".graduado")?.value || "",
        titulo: block.querySelector(".titulo")?.value || "",
        fecha: block.querySelector(".fecha")?.value || "",
        tarjeta: block.querySelector(".tarjeta")?.value || "",
      });
    });
  }

  // Idiomas dinámicos
  v.idiomas = [];
  const idiomasContainer = document.getElementById("idiomasContainer");
  if (idiomasContainer) {
    idiomasContainer.querySelectorAll(".idioma-block").forEach((block) => {
      v.idiomas.push({
        idioma: block.querySelector(".idioma-nombre")?.value || "",
        habla: block.querySelector(".idioma-habla")?.value || "",
        lee: block.querySelector(".idioma-lee")?.value || "",
        escribe: block.querySelector(".idioma-escribe")?.value || "",
      });
    });
  }

  // Experiencias dinámicas (de todos los paneles de Página 2)
  v.experiencias = [];
  const allExpContainers = document.querySelectorAll(".exp-container");
  allExpContainers.forEach((container) => {
    container.querySelectorAll(".exp-block").forEach((block) => {
      v.experiencias.push({
        empresa: (block.querySelector(".empresa")?.value || "").toUpperCase(),
        tipoEmpresa: (block.querySelector(".tipoEmpresa")?.value || "").toUpperCase(),
        pais: (block.querySelector(".pais")?.value || "").toUpperCase(),
        depto: (block.querySelector(".depto")?.value || "").toUpperCase(),
        municipio: (block.querySelector(".municipio")?.value || "").toUpperCase(),
        correo: (block.querySelector(".correo")?.value || "").toLowerCase(),
        telefono: (block.querySelector(".telefono")?.value || "").toUpperCase(),
        fechaIngreso: block.querySelector(".fechaIngreso")?.value || "",
        fechaRetiro: block.querySelector(".fechaRetiro")?.value || "",
        cargo: (block.querySelector(".cargo")?.value || "").toUpperCase(),
        dependencia: (block.querySelector(".dependencia")?.value || "").toUpperCase(),
        direccion: (block.querySelector(".direccion")?.value || "").toUpperCase(),
      });
    });
  });

  // Página 3 data (servidores)
  v.hoja3 = {
    servidorPublicoAnios: document.getElementById("servidorPublicoAnios")?.value || "",
    servidorPublicoMeses: document.getElementById("servidorPublicoMeses")?.value || "",
    servidorPrivadoAnios: document.getElementById("servidorPrivadoAnios")?.value || "",
    servidorPrivadoMeses: document.getElementById("servidorPrivadoMeses")?.value || "",
    trabajadorIndependienteAnios: document.getElementById("trabajadorIndependienteAnios")?.value || "",
    trabajadorIndependienteMeses: document.getElementById("trabajadorIndependienteMeses")?.value || "",
    Noinhabilidad: document.getElementById("Noinhabilidad")?.value || "",
    lugarFirma: document.getElementById("lugarFirma")?.value || "",
    fechaFirma: document.getElementById("fechaFirma")?.value || "",
  };

  return v;
}
const debouncedUpdate = debounce(updateDesktopPreview, 50);

// La navegación manual ha sido eliminada a petición del usuario.
// Se mantiene la lógica de cambio automático de página.

function goToPreviewPage(page, page2Index = 0) {
  if (page < 1 || page > 3) return;
  _currentPreviewPage = page;
  _currentPage2Index = page2Index;
  updateDesktopPreview();
}

// Auto-switch page based on focus
document.getElementById("formulario")?.addEventListener("focusin", (e) => {
  const target = e.target;
  const panel = target.closest("section[role='tabpanel']");
  if (!panel) return;

  const panelId = panel.id;
  if (panelId === "panel-p1") {
    goToPreviewPage(1);
  } else if (panelId === "panel-p2") {
    goToPreviewPage(2, 0);
  } else if (panelId.startsWith("panel-p2-ext-")) {
    const idx = parseInt(panelId.replace("panel-p2-ext-", ""));
    goToPreviewPage(2, idx);
  } else if (panelId === "panel-p3") {
    goToPreviewPage(3);
  }
});

// Sincronizar con clics en los tabs superiores
// This functionality is now handled by setupTopTabs
// document.querySelectorAll(".tablist .tab").forEach((tab, idx) => {
//   tab.addEventListener("click", () => {
//     // idx 0 -> p1, idx 1 -> p2, idx 2 -> p3
//     if (idx < 3) {
//       goToPreviewPage(idx + 1);
//     }
//   });
// });

// Adjuntar listeners usando delegación de eventos para mayor eficiencia y soporte dinámico
const formEl = document.getElementById("formulario");
if (formEl) {
  const handleInputChange = (e) => {
    // Solo actuar si es un campo de entrada
    if (e.target.matches("input, select, textarea")) {
      debouncedUpdate();
      saveFormDataToStorage();
    }
  };

  formEl.addEventListener("input", handleInputChange);
  formEl.addEventListener("change", handleInputChange);
  formEl.addEventListener("keyup", (e) => {
    // Algunas teclas especiales no disparan 'input' en navegadores antiguos o casos específicos
    if (e.target.matches("input, select, textarea")) {
      debouncedUpdate();
    }
  });
}

// Evento para el botón de limpiar formulario
const clearFormBtn = document.getElementById("clearFormBtn");
if (clearFormBtn) {
  clearFormBtn.addEventListener("click", (e) => {
    e.preventDefault();
    clearAllFormData();
  });
}

// Inicial render al cargar (después de precarga PDF.js quizás)
window.addEventListener("load", () => {
  // Restaurar datos guardados en IndexedDB/localStorage
  restoreFormDataFromStorage();

  // Asegurar que todos los selects sin valor mostren "Seleccionar..." (opción vacía)
  setTimeout(() => {
    document.querySelectorAll("#formulario select").forEach((select) => {
      // Si el select está vacío o tiene un valor inválido, ponerlo en vacío
      if (!select.value || !Array.from(select.options).find(opt => opt.value === select.value)) {
        select.value = "";
      }
    });
  }, 300);

  // Actualizar visibilidad de campos dependientes
  updatePaisVisibility();
  updateFechaGradoVisibility();
  setupTopTabs.init(); // Inicializar pestañas superiores
  setupTopTabs.activate(0); // Activar primera pestaña
  setTimeout(updateDesktopPreview, 800);
  // Bloqueo estricto de menú contextual sobre los canvas de preview
  (function blockCanvasContextMenu() {
    const desktopCanvas = document.getElementById("pdfCanvasDesktop");
    const mobileCanvas = document.getElementById("pdfCanvas");
    const zoomCanvas = document.getElementById("zoomCanvas");
    const canvases = [desktopCanvas, mobileCanvas, zoomCanvas].filter(Boolean);
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
    canvases.forEach(c => {
      c.setAttribute("oncontextmenu", "return false");
      c.setAttribute("draggable", "false");
      c.style.userSelect = "none";
      c.addEventListener("contextmenu", prevent);
      c.addEventListener("mousedown", e => { if (e.button === 2) prevent(e); });
      c.addEventListener("pointerdown", e => { if (e.button === 2) prevent(e); });
    });
    // Captura global en fase de captura para abortar menú nativo
    document.addEventListener("contextmenu", e => {
      if (canvases.includes(e.target)) prevent(e);
    }, true);
  })();
});

// Submit (mantiene overlay en móvil y botón abrir)
document.getElementById("formulario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  try {
    const pdfBytes = await buildPdfBytes();

    // En desktop: abrir zoom (mismo que al hacer clic en canvas)
    if (!isMobile) {
      await updateDesktopPreview();
      openDesktopCanvasPreview();
      return;
    }

    // Móvil: overlay accesible (dialog)
    const overlay = document.getElementById("previewOverlay");
    const closeBtn = document.getElementById("closePreview");
    overlay.classList.add("open");
    overlay.removeAttribute("hidden");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    document.documentElement.classList.add("lock-scroll");
    const canvas = document.getElementById("pdfCanvas");
    const container = document.getElementById("pdfCanvasContainer");
    const ctx = canvas.getContext("2d");
    let pdfLib;
    try {
      pdfLib = await ensurePdfJs();
    } catch { }
    try {
      const loadingTask = pdfLib.getDocument({ data: pdfBytes });
      const mobilePdf = await loadingTask.promise;
      const safePage = Math.min(
        Math.max(1, _currentPreviewPage),
        mobilePdf.numPages || 1
      );
      const page1 = await mobilePdf.getPage(safePage);
      const viewport = page1.getViewport({ scale: 1, rotation: 0, dontFlip: false });
      const maxW = container.clientWidth * window.devicePixelRatio;
      const maxH = container.clientHeight * window.devicePixelRatio;
      const scale = Math.min(
        maxW / viewport.width,
        maxH / viewport.height,
        1.6
      );
      const scaledViewport = page1.getViewport({ scale, rotation: 0, dontFlip: false });
      // Resetear posibles transformaciones sobrantes
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.save();
        ctx.resetTransform();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } catch { }
      // Resetear nuevamente antes de renderizar
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } catch { }
      // Cancelar render móvil anterior
      if (window._mobileRenderTask && typeof window._mobileRenderTask.cancel === 'function') {
        try { window._mobileRenderTask.cancel(); } catch (_) { }
      }
      canvas.width = Math.round(scaledViewport.width);
      canvas.height = Math.round(scaledViewport.height);
      canvas.style.width = Math.round(scaledViewport.width / window.devicePixelRatio) + "px";
      canvas.style.height = Math.round(scaledViewport.height / window.devicePixelRatio) + "px";
      const task = page1.render({ canvasContext: ctx, viewport: scaledViewport });
      window._mobileRenderTask = task;
      await task.promise;
      // Dibujar marca de agua en el canvas móvil
      drawWatermark(canvas);
      const closeHandler = () => {
        // Mover foco fuera antes de ocultar (evita foco en contenido oculto)
        const firstInput = document.getElementById("apellido1");
        if (firstInput) firstInput.focus();
        overlay.classList.remove("open");
        overlay.setAttribute("hidden", "");
        overlay.removeAttribute("aria-modal");
        overlay.removeAttribute("role");
        document.documentElement.classList.remove("lock-scroll");
        setTimeout(() => {
          try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          } catch { }
        }, 300);
        closeBtn.removeEventListener("click", closeHandler);
      };
      // Mover foco al botón cerrar cuando se abre
      closeBtn.focus();
      closeBtn.addEventListener("click", closeHandler);
    } catch (e2) {
      console.error("Render móvil fallo", e2);
      // Fallback: si pdf.js falla (CDN bloqueado u otro error), mostrar iframe con el blob URL
      try {
        if (_lastPdfUrl) {
          // Limpiar contenedor y añadir iframe como alternativa
          container.innerHTML = "";
          const iframe = document.createElement("iframe");
          iframe.src = _lastPdfUrl;
          iframe.style.width = "100%";
          iframe.style.height = "100%";
          iframe.style.border = "none";
          iframe.setAttribute("aria-label", "Vista previa PDF (fallback iframe)");
          container.appendChild(iframe);
          // Mostrar nota clara en el header por si el iframe no carga
          let note = overlay.querySelector('.notice');
          if (!note) {
            note = document.createElement('div');
            note.className = 'notice';
            note.textContent = 'Vista previa alternativa: si el visor no funciona, use "Abrir en nueva pestaña".';
            overlay.querySelector('.overlay-header')?.appendChild(note);
          }
          // Asegurar que el botón cerrar funcione y tenga foco
          closeBtn.focus();
          const closeHandlerFallback = () => {
            const firstInput = document.getElementById("apellido1");
            if (firstInput) firstInput.focus();
            overlay.classList.remove("open");
            overlay.setAttribute("hidden", "");
            overlay.removeAttribute("aria-modal");
            overlay.removeAttribute("role");
            document.documentElement.classList.remove("lock-scroll");
            try { iframe.remove(); } catch (_) { }
            try { note.remove(); } catch (_) { }
            closeBtn.removeEventListener("click", closeHandlerFallback);
          };
          closeBtn.addEventListener('click', closeHandlerFallback);
        }
      } catch (e3) {
        console.error('Fallback móvil también falló', e3);
      }
    }
  } catch (err) {
    console.error(err);
    // inline error en vez de alert
    let holder = document.getElementById("formError");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "formError";
      holder.className = "inline-error";
      const actions = document.querySelector(".form-actions");
      if (actions) actions.appendChild(holder);
    }
    holder.textContent = "Error al generar PDF: " + (err.message || err);
  }
});

// (Eliminado bloque antiguo de submit duplicado)

// Preload PDF.js en segundo plano poco después de que la página cargue
// para reducir la latencia en la primera previsualización (descarga con baja prioridad)
window.addEventListener("load", () => {
  // Preload PDF basico para optimizar preview escritorio
  initBasePdfCache();

  // pequeño retardo para no interferir con recursos críticos iniciales
  setTimeout(() => {
    ensurePdfJs()
      .then(() => {
        console.log("PDF.js precargado en background");
      })
      .catch(() => {
        /* ignorar fallo de precarga */
      });
  }, 1000);
});

// --- H2 -> dropdown colapsable dentro del formulario ---
// Convierte cada <h2> dentro del formulario en un toggle que muestra/oculta
// los nodos siguientes hasta el próximo <h2> (o fin del contenedor). Todo inicia colapsado.
(function setupH2Dropdowns() {
  const form = document.getElementById("formulario");
  if (!form) return;
  const mq = window.matchMedia('(min-width: 821px)');
  const pairs = [];
  // Tomamos todos los h2 dentro del formulario
  const allH2 = Array.from(form.querySelectorAll("h2"));
  allH2.forEach((h2) => {
    const parent = h2.parentElement;
    if (!parent) return;
    let sib = h2.nextElementSibling;
    const group = [];
    while (sib) {
      if (sib.tagName === "H2") break;
      if (sib.classList && sib.classList.contains("form-actions")) break;
      group.push(sib);
      sib = sib.nextElementSibling;
    }
    if (!group.length) {
      h2.classList.add("collapsible-h2");
      h2.setAttribute("role", "button");
      h2.setAttribute("aria-expanded", "false");
      h2.setAttribute("tabindex", "0");
      h2.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") e.preventDefault();
      });
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "section-collapse";
    group[0].before(wrapper);
    group.forEach((el) => wrapper.appendChild(el));
    h2.classList.add("collapsible-h2");
    h2.setAttribute("role", "button");
    h2.setAttribute("aria-expanded", "false");
    h2.setAttribute("tabindex", "0");
    // Estado inicial según viewport: escritorio = abierto, móvil = cerrado
    const isDesktop = mq.matches;
    wrapper.hidden = !isDesktop ? true : false;
    h2.setAttribute("aria-expanded", isDesktop ? "true" : "false");
    const toggle = () => {
      // Permitir colapsar/expandir en todos los tamaños
      const expanded = h2.getAttribute("aria-expanded") === "true";
      h2.setAttribute("aria-expanded", expanded ? "false" : "true");
      wrapper.hidden = expanded;
    };
    h2.addEventListener("click", toggle);
    h2.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    pairs.push({ h2, wrapper });
  });

  // Actualizar al cambiar el tamaño de la ventana
  const applyResponsiveState = () => {
    const isDesktop = mq.matches;
    pairs.forEach(({ h2, wrapper }) => {
      if (isDesktop) {
        wrapper.hidden = false;
        h2.setAttribute("aria-expanded", "true");
      } else {
        // En móvil: por defecto colapsado
        wrapper.hidden = true;
        h2.setAttribute("aria-expanded", "false");
      }
    });
  };
  try {
    mq.addEventListener('change', applyResponsiveState);
  } catch {
    // Safari antiguo: fallback
    mq.addListener(applyResponsiveState);
  }
})();

// -----------------------
// Educación superior dinámica (hasta 5)
// -----------------------
(function setupEducacionSuperior() {
  const MAX_ITEMS = 5;
  const section = document.getElementById("educacionSuperiorSection");
  const container = document.getElementById("eduContainer");
  const addBtn = document.getElementById("addEduBtn");
  if (!section || !container || !addBtn) return;

  // Plantilla de bloque (colapsable con <details>) cumpliendo accesibilidad
  function createEduBlock(index) {
    const idPrefix = `edu-${index}`;
    const wrap = document.createElement("details");
    wrap.className = "edu-block";
    wrap.open = true;
    wrap.dataset.index = String(index);
    wrap.id = `${idPrefix}-block`;
    wrap.innerHTML = `
      <summary class="edu-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
        <span class="chev" aria-hidden="true">▸</span>
        <strong id="${idPrefix}-title">Estudio ${index + 1}</strong>
      </summary>
      <div class="edu-actions" style="display:flex; justify-content:flex-end; margin:4px 0;">
        <button type="button" class="remove-edu" aria-label="Eliminar estudio" title="Eliminar" aria-describedby="${idPrefix}-title">✕</button>
      </div>
      <div class="form-grid edu-content" id="${idPrefix}-content" aria-labelledby="${idPrefix}-title">
        <div>
          <label for="${idPrefix}-modalidad">Modalidad Académica:</label>
          <select class="modalidad" id="${idPrefix}-modalidad" name="${idPrefix}-modalidad">
            <option value="">Seleccionar...</option>
            <option value="TC">TC: Técnica</option>
            <option value="TL">TL: Tecnológica</option>
            <option value="TE">TE: Tecnológica Especializada</option>
            <option value="UN">UN: Universitaria</option>
            <option value="ES">ES: Especialización</option>
            <option value="MG">MG: Maestría / Magíster</option>
            <option value="DOC">DOC: Doctorado / PHD</option>
          </select>
        </div>
        <div>
          <label for="${idPrefix}-semestres">Semestres Aprobados:</label>
          <input type="number" min="0" class="semestres" id="${idPrefix}-semestres" name="${idPrefix}-semestres" value="0" />
        </div>
        <div>
          <label for="${idPrefix}-graduado">¿Graduado?</label>
          <select class="graduado" id="${idPrefix}-graduado" name="${idPrefix}-graduado">
            <option value="">Seleccionar...</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
          </select>
        </div>
        <div>
          <label for="${idPrefix}-titulo">Título Obtenido:</label>
          <input type="text" class="titulo" id="${idPrefix}-titulo" name="${idPrefix}-titulo" />
        </div>
        <div>
          <label for="${idPrefix}-fecha">Fecha de Grado:</label>
          <input type="date" class="fecha" id="${idPrefix}-fecha" name="${idPrefix}-fecha" />
        </div>
        <div>
          <label for="${idPrefix}-tarjeta">Tarjeta Profesional:</label>
          <input type="text" class="tarjeta" id="${idPrefix}-tarjeta" name="${idPrefix}-tarjeta" />
        </div>
      </div>
    `;
    return wrap;
  }

  function updateAddBtn() {
    const count = container.querySelectorAll(".edu-block").length;
    addBtn.disabled = count >= MAX_ITEMS;
  }

  function addEdu() {
    const count = container.querySelectorAll(".edu-block").length;
    if (count >= MAX_ITEMS) return;
    const block = createEduBlock(count);
    container.appendChild(block);
    // Envolver inputs de texto con botones de limpiar
    setupClearButtonsForDynamicInputs(block);
    // listeners de cambio para auto-preview y guardado
    block.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", (e) => {
        debouncedUpdate(e);
        saveFormDataToStorage();
      });
      el.addEventListener("change", (e) => {
        debouncedUpdate(e);
        saveFormDataToStorage();
      });
    });
    updateAddBtn();
    debouncedUpdate();
    saveFormDataToStorage();
  }

  function removeEdu(btn) {
    const block = btn.closest(".edu-block");
    if (!block) return;
    block.remove();
    // reindex títulos
    Array.from(container.querySelectorAll(".edu-block")).forEach((b, i) => {
      b.dataset.index = String(i);
      const title = b.querySelector(".edu-header strong");
      if (title) title.textContent = `Estudio ${i + 1}`;
    });
    updateAddBtn();
    debouncedUpdate();
    saveFormDataToStorage();
  }

  addBtn.addEventListener("click", addEdu);
  container.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("remove-edu")) {
      e.preventDefault();
      e.stopPropagation();
      removeEdu(t);
    }
  });

  // No agregar bloques al inicio: el usuario decide cuándo crear el primero
  updateAddBtn();
})();

// (Código legado eliminado por redundancia con getFormData y setupExperienciaLogic)
// Idiomas dinámicos (hasta 2) similar a educación superior
// -----------------------
(function setupIdiomas() {
  const MAX_IDIOMAS = 2;
  const container = document.getElementById("idiomasContainer");
  const addBtn = document.getElementById("addIdiomaBtn");
  if (!container || !addBtn) return;

  function createIdiomaBlock(index) {
    const idPrefix = `idioma-${index}`;
    const wrap = document.createElement("details");
    wrap.className = "idioma-block";
    wrap.open = true;
    wrap.dataset.index = String(index);
    wrap.id = `${idPrefix}-block`;
    wrap.innerHTML = `
      <summary class="idioma-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
        <span class="chev" aria-hidden="true">▸</span>
        <strong id="${idPrefix}-title">Idioma ${index + 1}</strong>
      </summary>
      <div class="idioma-actions" style="display:flex; justify-content:flex-end; margin:4px 0;">
        <button type="button" class="remove-idioma" aria-label="Eliminar idioma" title="Eliminar" aria-describedby="${idPrefix}-title">✕</button>
      </div>
      <div class="form-grid idioma-content" id="${idPrefix}-content" aria-labelledby="${idPrefix}-title">
        <div>
          <label for="${idPrefix}-nombre">Idioma:</label>
          <input type="text" class="idioma-nombre" id="${idPrefix}-nombre" name="${idPrefix}-nombre" />
        </div>
        <div>
          <label for="${idPrefix}-habla">¿Lo habla?</label>
          <select class="idioma-habla" id="${idPrefix}-habla" name="${idPrefix}-habla">
            <option value="">Seleccionar...</option>
            <option value="REGULAR">Regular</option>
            <option value="BIEN">Bien</option>
            <option value="MUYBIEN">Muy bien</option>
          </select>
        </div>
        <div>
          <label for="${idPrefix}-lee">¿Lo lee?</label>
          <select class="idioma-lee" id="${idPrefix}-lee" name="${idPrefix}-lee">
            <option value="">Seleccionar...</option>
            <option value="REGULAR">Regular</option>
            <option value="BIEN">Bien</option>
            <option value="MUYBIEN">Muy bien</option>
          </select>
        </div>
        <div>
          <label for="${idPrefix}-escribe">¿Lo escribe?</label>
          <select class="idioma-escribe" id="${idPrefix}-escribe" name="${idPrefix}-escribe">
            <option value="">Seleccionar...</option>
            <option value="REGULAR">Regular</option>
            <option value="BIEN">Bien</option>
            <option value="MUYBIEN">Muy bien</option>
          </select>
        </div>
      </div>
    `;
    return wrap;
  }

  function updateAddBtn() {
    const count = container.querySelectorAll(".idioma-block").length;
    addBtn.disabled = count >= MAX_IDIOMAS;
  }

  function addIdioma() {
    const count = container.querySelectorAll(".idioma-block").length;
    if (count >= MAX_IDIOMAS) return;
    const block = createIdiomaBlock(count);
    container.appendChild(block);
    // Envolver inputs de texto con botones de limpiar
    setupClearButtonsForDynamicInputs(block);
    block.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", (e) => {
        debouncedUpdate(e);
        saveFormDataToStorage();
      });
      el.addEventListener("change", (e) => {
        debouncedUpdate(e);
        saveFormDataToStorage();
      });
    });
    updateAddBtn();
    debouncedUpdate();
    saveFormDataToStorage();
  }

  function removeIdioma(btn) {
    const block = btn.closest(".idioma-block");
    if (!block) return;
    block.remove();
    Array.from(container.querySelectorAll(".idioma-block")).forEach((b, i) => {
      b.dataset.index = String(i);
      const title = b.querySelector(".idioma-header strong");
      if (title) title.textContent = `Idioma ${i + 1}`;
    });
    updateAddBtn();
    debouncedUpdate();
    saveFormDataToStorage();
  }

  addBtn.addEventListener("click", addIdioma);
  container.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("remove-idioma")) {
      e.preventDefault();
      e.stopPropagation();
      removeIdioma(t);
    }
  });

  // No agregar idiomas por defecto
  updateAddBtn();
})();

// -----------------------
// Tabs de 3 páginas (Página 1, 2, 3)
// -----------------------
const setupTopTabs = (function () {
  let tabs = [];
  let panels = [];

  function activate(index) {
    tabs.forEach((t, i) => {
      const selected = i === index;
      t.classList.toggle("active", selected);
      t.setAttribute("aria-selected", selected ? "true" : "false");
      if (panels[i]) panels[i].hidden = !selected;
    });

    // Mapear el índice del tab a la página del PDF y el índice de página 2 extra
    let pdfPage = 1;
    let page2Idx = 0;

    if (index === 0) {
      pdfPage = 1;
    } else if (index === tabs.length - 1) {
      pdfPage = 3;
    } else {
      pdfPage = 2;
      page2Idx = index - 1; // 1 -> 0, 2 -> 1, etc.
    }

    goToPreviewPage(pdfPage, page2Idx);

    const dlBtn = document.getElementById("downloadPdfBtn");
    if (dlBtn) dlBtn.style.display = (index === tabs.length - 1) ? "inline-block" : "none";
  }

  function init() {
    tabs = Array.from(document.querySelectorAll(".tablist .tab"));
    const p1 = document.getElementById("panel-p1");
    const p2 = document.getElementById("panel-p2");
    const p2Extras = Array.from(document.getElementById("extraPagePanels").children);
    const p3 = document.getElementById("panel-p3");
    panels = [p1, p2, ...p2Extras, p3].filter(Boolean);

    tabs.forEach((t, i) => {
      t.replaceWith(t.cloneNode(true)); // Limpiar listeners previos
    });
    tabs = Array.from(document.querySelectorAll(".tablist .tab"));

    tabs.forEach((t, i) => {
      t.addEventListener("click", (e) => {
        e.preventDefault();
        activate(i);
      });
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const dir = e.key === "ArrowRight" ? 1 : -1;
          const next = (i + dir + tabs.length) % tabs.length;
          tabs[next].focus();
          activate(next);
        }
      });
    });
  }

  return { init, activate };
})();
window.setupTopTabs = setupTopTabs;

function setupExperienciaLogic(container, addBtn, isExtra = false) {
  const MAX_EXP = 4;
  const trabajaSel = document.getElementById("trabajaActualmente");

  function updateCurrentJobUI() {
    if (isExtra || !trabajaSel) return;
    const val = (trabajaSel.value || "").toUpperCase();
    const first = container.querySelector('.exp-block[data-index="0"]');
    if (first) {
      const retiro = first.querySelector(".fechaRetiro");
      const title = first.querySelector(".exp-header strong");
      if (val === "SI") {
        if (title) title.textContent = "Experiencia actual";
        if (retiro) {
          retiro.value = "";
          retiro.disabled = true;
          retiro.title = "Deshabilitado: actualmente laborando";
        }
      } else {
        if (title) title.textContent = "Experiencia 1";
        if (retiro) {
          retiro.disabled = false;
          retiro.removeAttribute("title");
        }
      }
    }
  }

  function updateAddBtn() {
    const count = container.querySelectorAll(".exp-block").length;
    // Para páginas extra no dependemos de "Empleo Actual" para habilitar el botón
    const selectionMissing = !isExtra && !(trabajaSel && (trabajaSel.value || "").trim());
    const sel = (trabajaSel?.value || "").toUpperCase();
    const maxAllowed = (!isExtra && sel === "NO") ? 3 : MAX_EXP;
    addBtn.disabled = count >= maxAllowed || selectionMissing;
  }

  function createExpBlock(index) {
    const uniqueId = `exp-p${isExtra ? _extraPage2Ids.length + 1 : 0}-${index}`;
    const wrap = document.createElement("details");
    wrap.className = "exp-block";
    wrap.open = true;
    wrap.dataset.index = String(index);
    wrap.id = `${uniqueId}-block`;
    wrap.innerHTML = `
      <summary class="exp-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
        <span class="chev" aria-hidden="true">▸</span>
        <strong id="${uniqueId}-title">Experiencia ${index + 1}</strong>
      </summary>
      <div class="exp-actions" style="display:flex; justify-content:flex-end; margin:4px 0;">
        <button type="button" class="remove-exp" aria-label="Eliminar experiencia" title="Eliminar" aria-describedby="${uniqueId}-title">✕</button>
      </div>
      <div class="form-grid exp-content" id="${uniqueId}-content" aria-labelledby="${uniqueId}-title">
        <div>
          <label for="${uniqueId}-empresa">Empresa o Entidad:</label>
          <input type="text" class="empresa" id="${uniqueId}-empresa" name="${uniqueId}-empresa" />
        </div>
        <div>
          <label for="${uniqueId}-tipo">Tipo de Empresa:</label>
          <select class="tipoEmpresa" id="${uniqueId}-tipo" name="${uniqueId}-tipo">
            <option value="">Seleccionar...</option>
            <option value="PUBLICA">Pública</option>
            <option value="PRIVADA">Privada</option>
          </select>
        </div>
        <div>
          <label for="${uniqueId}-pais">País:</label>
          <input type="text" class="pais" id="${uniqueId}-pais" name="${uniqueId}-pais" />
        </div>
        <div>
          <label for="${uniqueId}-depto">Departamento:</label>
          <input type="text" class="depto" id="${uniqueId}-depto" name="${uniqueId}-depto" />
        </div>
        <div>
          <label for="${uniqueId}-municipio">Municipio:</label>
          <input type="text" class="municipio" id="${uniqueId}-municipio" name="${uniqueId}-municipio" />
        </div>
        <div>
          <label for="${uniqueId}-correo">Correo:</label>
          <input type="email" class="correo" id="${uniqueId}-correo" name="${uniqueId}-correo" />
        </div>
        <div>
          <label for="${uniqueId}-telefono">Teléfono:</label>
          <input type="text" class="telefono" id="${uniqueId}-telefono" name="${uniqueId}-telefono" />
        </div>
        <div>
          <label for="${uniqueId}-fechaIngreso">Fecha de Ingreso:</label>
          <input type="date" class="fechaIngreso" id="${uniqueId}-fechaIngreso" name="${uniqueId}-fechaIngreso" />
        </div>
        <div>
          <label for="${uniqueId}-fechaRetiro">Fecha de Retiro:</label>
          <input type="date" class="fechaRetiro" id="${uniqueId}-fechaRetiro" name="${uniqueId}-fechaRetiro" />
        </div>
        <div>
          <label for="${uniqueId}-cargo">Cargo:</label>
          <input type="text" class="cargo" id="${uniqueId}-cargo" name="${uniqueId}-cargo" />
        </div>
        <div>
          <label for="${uniqueId}-dependencia">Dependencia:</label>
          <input type="text" class="dependencia" id="${uniqueId}-dependencia" name="${uniqueId}-dependencia" />
        </div>
        <div>
          <label for="${uniqueId}-direccion">Dirección:</label>
          <input type="text" class="direccion" id="${uniqueId}-direccion" name="${uniqueId}-direccion" />
        </div>
      </div>
    `;
    return wrap;
  }

  function addExp() {
    const count = container.querySelectorAll(".exp-block").length;
    if (!isExtra && !(trabajaSel && (trabajaSel.value || "").trim())) {
      showEmpleoError("Seleccione 'Sí' o 'No' para 'Empleo Actual' antes de añadir experiencias.");
      flashAndFocus(trabajaSel);
      return;
    }
    const sel = (trabajaSel?.value || "").toUpperCase();
    const maxAllowed = (!isExtra && sel === "NO") ? 3 : MAX_EXP;
    if (count >= maxAllowed) {
      if (!isExtra) {
        showEmpleoError(`No puede agregar más de ${maxAllowed} experiencia(s) para la opción seleccionada.`);
        flashAndFocus(trabajaSel);
      }
      return;
    }
    const block = createExpBlock(count);
    container.appendChild(block);
    setupClearButtonsForDynamicInputs(block);
    block.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", (e) => {
        debouncedUpdate(e);
        saveFormDataToStorage();
      });
      el.addEventListener("change", (e) => {
        debouncedUpdate(e);
        saveFormDataToStorage();
      });
    });
    updateAddBtn();
    updateCurrentJobUI();
    debouncedUpdate();
    saveFormDataToStorage();
  }

  function removeExp(btn) {
    const block = btn.closest(".exp-block");
    if (!block) return;
    block.remove();
    Array.from(container.querySelectorAll(".exp-block")).forEach((b, i) => {
      b.dataset.index = String(i);
      const title = b.querySelector(".exp-header strong");
      const currently = !isExtra && (trabajaSel?.value || "").toUpperCase() === "SI";
      if (title) {
        if (!isExtra && i === 0 && currently) {
          title.textContent = "Experiencia actual";
        } else {
          title.textContent = `Experiencia ${i + 1}`;
        }
      }
    });
    updateAddBtn();
    updateCurrentJobUI();
    debouncedUpdate();
    saveFormDataToStorage();
  }

  addBtn.addEventListener("click", (e) => {
    e.preventDefault();
    addExp();
  });

  container.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("remove-exp")) {
      e.preventDefault();
      e.stopPropagation();
      removeExp(t);
    }
  });

  if (!isExtra && trabajaSel) {
    trabajaSel.addEventListener("change", () => {
      updateCurrentJobUI();
      updateAddBtn();
      showEmpleoError(null);
      debouncedUpdate();
    });
    trabajaSel.addEventListener("focus", () => showEmpleoError(null));
  }

  updateAddBtn();
  updateCurrentJobUI();
}

function flashAndFocus(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) { } }
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
  el.classList.add('attention');
  setTimeout(() => el.classList.remove('attention'), 900);
}

function addExtraPage2() {
  const count = _extraPage2Ids.length + 1;
  const newIdx = _extraPage2Ids.length;
  const panelId = `panel-p2-ext-${newIdx}`;
  const tabId = `tab-p2-ext-${newIdx}`;

  // 1. Crear el Tab
  const tablist = document.querySelector(".tablist");
  const lastTab = document.getElementById("tab-p3");
  const newTab = document.createElement("button");
  newTab.type = "button";
  newTab.id = tabId;
  newTab.className = "tab";
  newTab.setAttribute("role", "tab");
  newTab.setAttribute("aria-selected", "false");
  newTab.textContent = `Página 2.${count}`;
  tablist.insertBefore(newTab, lastTab);

  // 2. Crear el Panel (clonando estructura de P2)
  const extraContainer = document.getElementById("extraPagePanels");
  const newPanel = document.createElement("section");
  newPanel.id = panelId;
  newPanel.setAttribute("role", "tabpanel");
  newPanel.setAttribute("aria-labelledby", tabId);
  newPanel.hidden = true;

  newPanel.innerHTML = `
    <div class="panel-placeholder">
      <button type="button" class="remove-page" data-panel-id="${panelId}">
        <span>🗑️</span> Eliminar esta página
      </button>
      <h2>EXPERIENCIA LABORAL (ADICIONAL)</h2>
      <details class="section" open>
        <summary>Experiencia Laboral (Página 2.${count})</summary>
        <div id="expContainer-ext-${newIdx}" class="exp-container"></div>
        <button type="button" id="addExpBtn-ext-${newIdx}" class="add-exp">➕ Añadir experiencia</button>
        <p class="hint" style="font-size: 12px; color: #555; margin-top: 8px">
          Esta página adicional permite agregar hasta 4 experiencias laborales más. 
          Se insertará automáticamente después de la Página 2 original en el PDF.
        </p>
      </details>
    </div>
  `;
  extraContainer.appendChild(newPanel);

  _extraPage2Ids.push(panelId);

  // 3. Inicializar lógica para el nuevo panel
  const newExpContainer = document.getElementById(`expContainer-ext-${newIdx}`);
  const newAddExpBtn = document.getElementById(`addExpBtn-ext-${newIdx}`);
  setupExperienciaLogic(newExpContainer, newAddExpBtn, true);

  // 4. Re-inicializar Tabs para incluir el nuevo
  setupTopTabs.init();

  // 5. Activar el nuevo tab
  const allTabs = Array.from(document.querySelectorAll(".tablist .tab"));
  setupTopTabs.activate(allTabs.length - 2); // el penúltimo antes de P3

  saveFormDataToStorage();
}

function removeExtraPage2(panelId) {
  if (!confirm("¿Estás seguro de que deseas eliminar esta página adicional y toda su experiencia laboral?")) return;

  const panel = document.getElementById(panelId);
  if (panel) panel.remove();

  // Obtener todos los paneles extras que quedaron
  const extraPanels = Array.from(document.getElementById("extraPagePanels").children);
  const tablist = document.querySelector(".tablist");

  // Eliminar todos los tabs de páginas extras actuales para reconstruirlos
  _extraPage2Ids.forEach((id, i) => {
    const tab = document.getElementById(`tab-p2-ext-${i}`);
    if (tab) tab.remove();
  });

  _extraPage2Ids = [];

  // Re-indexar paneles y re-crear tabs
  const lastTab = document.getElementById("tab-p3");
  extraPanels.forEach((p, i) => {
    const newIdx = i;
    const newCount = i + 1;
    const newPanelId = `panel-p2-ext-${newIdx}`;
    const newTabId = `tab-p2-ext-${newIdx}`;

    // Actualizar Panel
    p.id = newPanelId;
    p.setAttribute("aria-labelledby", newTabId);

    // Actualizar resumen y IDs internos
    const summary = p.querySelector("summary");
    if (summary) summary.textContent = `Experiencia Laboral (Página 2.${newCount})`;

    const container = p.querySelector(".exp-container");
    if (container) container.id = `expContainer-ext-${newIdx}`;

    const addBtn = p.querySelector(".add-exp");
    if (addBtn) addBtn.id = `addExpBtn-ext-${newIdx}`;

    const delBtn = p.querySelector(".remove-page");
    if (delBtn) delBtn.setAttribute("data-panel-id", newPanelId);

    // Re-crear Tab
    const newTab = document.createElement("button");
    newTab.type = "button";
    newTab.id = newTabId;
    newTab.className = "tab";
    newTab.setAttribute("role", "tab");
    newTab.setAttribute("aria-selected", "false");
    newTab.textContent = `Página 2.${newCount}`;
    tablist.insertBefore(newTab, lastTab);

    _extraPage2Ids.push(newPanelId);
  });

  // Re-inicializar sistema de pestañas
  setupTopTabs.init();
  setupTopTabs.activate(1); // Volver a la Página 2 original (o podrías activar la 0)

  saveFormDataToStorage();
  debouncedUpdate();
}

(function setupDynamicPage2() {
  document.addEventListener("click", (e) => {
    // Manejar botón de añadir
    const addBtn = e.target.closest("#addExtraPageBtn");
    if (addBtn) {
      e.preventDefault();
      addExtraPage2();
      return;
    }

    // Manejar botón de eliminar
    const delBtn = e.target.closest(".remove-page");
    if (delBtn) {
      e.preventDefault();
      const panelId = delBtn.getAttribute("data-panel-id");
      removeExtraPage2(panelId);
      return;
    }
  });
})();
// La recolección de experiencias dinámicas ahora se maneja en getFormData.

// -----------------------
// Navegación del sitio (header/footer)
// -----------------------
(function setupSiteNav() {
  // Soportar tanto el header antiguo (.site-*) como el nuevo unificado (.home-*)
  const candidates = [
    { toggle: '.nav-toggle', nav: '.site-nav' },
    { toggle: '.home-navToggle', nav: '.home-nav' },
  ];
  candidates.forEach(({ toggle: tSel, nav: nSel }) => {
    const toggle = document.querySelector(tSel);
    const nav = document.querySelector(nSel);
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      nav.classList.toggle('open', !expanded);
    });
    // Cerrar al navegar por tabs
    const closeMenu = () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    document.querySelectorAll(`${nSel} a[data-tab], .footer-nav a[data-tab], .home-footerNav a[data-tab]`).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const n = a.getAttribute('data-tab');
        const btn = document.getElementById(`tab-p${n}`);
        if (btn) btn.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        closeMenu();
      });
    });
  });
})();

// -----------------------
// Botón Descargar PDF (Página 3)
// -----------------------
(function setupDownloadPdf() {
  const btn = document.getElementById("downloadPdfBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    // Validación: si hay experiencias añadidas, asegurar que el campo 'empleo actual' esté seleccionado
    const trabajaSel = document.getElementById("trabajaActualmente");
    const expContainer = document.getElementById("expContainer");
    if (
      expContainer &&
      expContainer.querySelectorAll(".exp-block").length > 0 &&
      !(trabajaSel && (trabajaSel.value || "").trim())
    ) {
      showEmpleoError("Seleccione 'Sí' o 'No' para 'Empleo Actual' antes de generar el PDF.");
      flashAndFocus(trabajaSel);
      return;
    }
    btn.disabled = true;
    try {
      const bytes = await buildPdfBytes();

      // Guardar PDF en IndexedDB para que esté disponible después del pago
      const reference = "default-" + Date.now();
      await savePdfToStorage(bytes, reference);

      // También guardar datos del formulario para poder regenerar el PDF si es necesario
      await saveFormDataToStorage();

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hoja_vida.pdf";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1500);
    } catch (err) {
      console.warn("Descarga PDF falló:", err);
    }
    btn.disabled = false;
  });
})();
// --- ENVOLVER INPUTS CON BOTONES DE LIMPIAR ---
(function setupClearButtons() {
  document.querySelectorAll("#formulario input[type='text'], #formulario input[type='email'], #formulario input[type='tel'], #formulario input[type='date']").forEach((input) => {
    // Saltar inputs que ya estén envueltos
    if (input.parentElement && input.parentElement.classList.contains("input-wrapper")) return;

    // Crear wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "input-wrapper";

    // Insertar wrapper antes del input
    input.parentNode.insertBefore(wrapper, input);

    // Mover input adentro del wrapper
    wrapper.appendChild(input);

    // Crear botón de limpiar
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn-clear-input";
    clearBtn.title = "Borrar este campo";
    clearBtn.innerHTML = "✕";
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearSingleInput(input.id);
    });

    // Agregar botón al wrapper
    wrapper.appendChild(clearBtn);
  });
})();

// --- FUNCIÓN PARA ENVOLVER INPUTS DINÁMICOS CON BOTONES DE LIMPIAR ---
function setupClearButtonsForDynamicInputs(container) {
  if (!container) return;
  container.querySelectorAll("input[type='text'], input[type='email'], input[type='tel'], input[type='date']").forEach((input) => {
    // Saltar inputs que ya estén envueltos
    if (input.parentElement && input.parentElement.classList.contains("input-wrapper")) return;

    // Crear wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "input-wrapper";

    // Insertar wrapper antes del input
    input.parentNode.insertBefore(wrapper, input);

    // Mover input adentro del wrapper
    wrapper.appendChild(input);

    // Crear botón de limpiar
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn-clear-input";
    clearBtn.title = "Borrar este campo";
    clearBtn.innerHTML = "✕";
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      debouncedUpdate();
      saveFormDataToStorage();
    });

    // Agregar botón al wrapper
    wrapper.appendChild(clearBtn);
  });
}

// --- BOTÓN DE DESCARGA DE PRUEBA (sin pago) ---
const testDownloadBtn = document.getElementById("testDownloadPdfBtn");
if (testDownloadBtn) {
  testDownloadBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      testDownloadBtn.disabled = true;
      testDownloadBtn.textContent = "⏳ Generando...";

      const pdfBytes = await buildPdfBytes();

      // Crear blob y descargar
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Formato_Unico_Hoja_Vida_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      testDownloadBtn.textContent = "✅ ¡Descargado!";
      setTimeout(() => {
        testDownloadBtn.textContent = "📥 Descargar PDF (Prueba)";
        testDownloadBtn.disabled = false;
      }, 2000);
    } catch (err) {
      console.error("Error al descargar PDF de prueba:", err);
      testDownloadBtn.textContent = "❌ Error";
      alert("No se pudo generar el PDF. Verifica los datos ingresados.");
      setTimeout(() => {
        testDownloadBtn.textContent = "📥 Descargar PDF (Prueba)";
        testDownloadBtn.disabled = false;
      }, 2000);
    }
  });
}

// --- FUNCIONALIDAD ZOOM ESCRITORIO (Portado de Persona Jurídica) ---
function openDesktopCanvasPreview() {
  if (document.getElementById("canvas-preview-overlay")) return;
  const mainCanvas = document.getElementById("pdfCanvasDesktop");
  if (!mainCanvas || !mainCanvas.width || !mainCanvas.height) return;

  // crear overlay
  const overlay = document.createElement("div");
  overlay.id = "canvas-preview-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.85)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "flex-start"; // Alinear arriba para el scroll
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "3000";
  overlay.style.overflow = "auto"; // Permitir scroll si la imagen crece
  overlay.style.padding = "40px";
  overlay.style.cursor = "zoom-in";

  // contenedor interno para centrado flexible
  const container = document.createElement("div");
  container.style.margin = "auto";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";
  container.style.minHeight = "min-content";

  // crear canvas temporal para copiar la imagen
  const temp = document.createElement("canvas");
  const ctx = temp.getContext("2d");
  const srcW = mainCanvas.width;
  const srcH = mainCanvas.height;

  temp.width = srcW;
  temp.height = srcH;
  temp.style.display = "block";
  temp.style.boxShadow = "0 12px 40px rgba(0,0,0,0.6)";
  temp.style.background = "#fff";
  temp.style.transition = "width 0.1s ease-out, height 0.1s ease-out";
  temp.style.cursor = "grab";

  // Evitar menú contextual
  temp.addEventListener("contextmenu", (ev) => ev.preventDefault());
  ctx.drawImage(mainCanvas, 0, 0);

  // Escala inicial: ajustar a la pantalla
  const padding = 80;
  const availableW = window.innerWidth - padding;
  const availableH = window.innerHeight - padding;
  let currentScale = Math.min(availableW / srcW, availableH / srcH, 1.0);

  function applyZoom() {
    temp.style.width = srcW * currentScale + "px";
    temp.style.height = srcH * currentScale + "px";
  }

  applyZoom();

  // Manejar Zoom con la rueda del ratón
  overlay.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const zoomStep = 0.1;
      if (e.deltaY < 0) {
        currentScale += zoomStep;
      } else {
        currentScale -= zoomStep;
      }
      // Limites de zoom
      currentScale = Math.max(0.2, Math.min(4.0, currentScale));
      applyZoom();
    },
    { passive: false }
  );

  // Cerrar al hacer click en el fondo (overlay)
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay || ev.target === container) {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
        document.body.classList.remove("lock-scroll");
      }
    }
  });

  // Soporte para cerrar con ESC
  const onKey = (ev) => {
    if (ev.key === "Escape") {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
        document.body.classList.remove("lock-scroll");
      }
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  // Soporte para arrastrar (panning)
  let isDragging = false;
  let startX, startY, scrollLeft, scrollTop;

  temp.addEventListener("mousedown", (e) => {
    isDragging = true;
    temp.style.cursor = "grabbing";
    startX = e.pageX - overlay.offsetLeft;
    startY = e.pageY - overlay.offsetTop;
    scrollLeft = overlay.scrollLeft;
    scrollTop = overlay.scrollTop;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - overlay.offsetLeft;
    const y = e.pageY - overlay.offsetTop;
    const walkX = x - startX;
    const walkY = y - startY;
    overlay.scrollLeft = scrollLeft - walkX;
    overlay.scrollTop = scrollTop - walkY;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    temp.style.cursor = "grab";
  });

  // Indicador visual de zoom
  const hint = document.createElement("div");
  hint.textContent = "Rueda: Zoom | Arrastrar: Mover | ESC: Cerrar";
  hint.style.color = "#fff";
  hint.style.marginTop = "15px";
  hint.style.fontSize = "14px";
  hint.style.background = "rgba(0,0,0,0.5)";
  hint.style.padding = "6px 16px";
  hint.style.borderRadius = "20px";
  hint.style.pointerEvents = "none";

  container.appendChild(temp);
  container.appendChild(hint);

  overlay.appendChild(container);
  document.body.appendChild(overlay);
  document.body.classList.add("lock-scroll");
}

// Inicializar listener de click en el canvas desktop
window.addEventListener("load", () => {
  // Reintentar adjuntar, por si acaso el elemento se recrea
  const attachZoom = () => {
    const canvasDesktop = document.getElementById("pdfCanvasDesktop");
    if (canvasDesktop && canvasDesktop.parentElement) {
      if (canvasDesktop.parentElement.getAttribute("data-zoom-attached")) return;
      canvasDesktop.parentElement.setAttribute("data-zoom-attached", "true");

      canvasDesktop.parentElement.addEventListener("click", (e) => {
        // Si el click fue en el overlay (el div con texto Zoom) o el canvas
        if (
          e.target === canvasDesktop ||
          e.target.closest(".canvas-overlay") ||
          e.target.closest(".canvas-zoom-wrapper")
        ) {
          openDesktopCanvasPreview();
        }
      });
    }
  };
  // Adjuntar inmediatamente
  attachZoom();
  // Y reintentar brevemente después por si había render pendiente
  setTimeout(attachZoom, 1000);

  // --- SAFEGUARD: Limpieza de duplicados y visibilidad ---
  // Eliminar posibles contenedores duplicados si existen
  const containers = document.querySelectorAll("#previewDesktopContainer");
  if (containers.length > 1) {
    console.warn("Detectados contenedores de vista previa duplicados. Eliminando extras...");
    for (let i = 1; i < containers.length; i++) {
      containers[i].remove();
    }
  }
  // Asegurar que el overlay móvil no se muestre en desktop por error
  const mobileOverlay = document.getElementById("previewOverlay");
  if (mobileOverlay && window.innerWidth > 768) {
    mobileOverlay.style.display = 'none';
    mobileOverlay.hidden = true;
  }
});
