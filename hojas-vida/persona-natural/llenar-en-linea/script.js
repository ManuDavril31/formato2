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

// --- ESTADO CENTRALIZADO DE PÁGINAS 2 ---
// Almacena la configuración de cada instancia de Página 2 (obligatorio por requerimiento)
window._page2State = [
  {
    id: "main-p2",
    type: "main",
    label: "Página 2",
    containerId: "expContainer",
    panelId: "panel-p2",
    tabId: "tab-p2"
  }
];


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

    // Guardar bloques dinámicos de experiencia laboral (Iterando sobre _page2State)
    if (window._page2State && Array.isArray(window._page2State)) {
      formData._page2State = window._page2State;
      formData._page2Data = {}; // Mapa ID -> Array de datos

      window._page2State.forEach((p) => {
        const container = document.getElementById(p.containerId);
        if (container) {
          const blocks = [];
          container.querySelectorAll(".exp-block").forEach((block) => {
            const blockData = {
              empresa: block.querySelector(".empresa")?.value || "",
              tipoEmpresa: block.querySelector(".tipoEmpresa")?.value || "",
              pais: block.querySelector(".pais")?.value || "",
              depto: block.querySelector(".depto")?.value || "",
              municipio: block.querySelector(".municipio")?.value || "",
              correo: block.querySelector(".correo")?.value || "",
              telefono: block.querySelector(".telefono")?.value || "",
              fechaIngreso: block.querySelector(".fechaIngreso")?.value || "",
              fechaRetiro: block.querySelector(".fechaRetiro")?.value || "",
              cargo: block.querySelector(".cargo")?.value || "",
              dependencia: block.querySelector(".dependencia")?.value || "",
              direccion: block.querySelector(".direccion")?.value || ""
            };
            blocks.push(blockData);
          });
          formData._page2Data[p.id] = blocks;
        }
      });
    } else {
      // Fallback clásico si no hay _page2State (no debería pasar con la nueva inicialización)
      const expContainer = document.getElementById("expContainer");
      if (expContainer) {
        // ... lógica antigua ...
      }
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

    // Restaurar estructura de páginas dinámicas (Página 2)
    if (formData._page2State && Array.isArray(formData._page2State)) {
      // Restaurar estado global
      window._page2State = formData._page2State;

      // Limpiar contenedores extra existentes y tabs extra
      const extraPanels = document.getElementById("extraPagePanels");
      if (extraPanels) extraPanels.innerHTML = "";
      // Eliminar tabs extra (cualquiera con id tab-p2-ext-*)
      document.querySelectorAll("button[id^='tab-p2-ext-']").forEach(t => t.remove());

      // Recrear DOM para las páginas extra (índice 1 en adelante)
      const tablist = document.querySelector(".tablist");
      const tabP3 = document.getElementById("tab-p3");

      // Helper para recrear inputs dinámicos dentro de un container
      const restoreExpBlocks = (container, blocksData) => {
        container.innerHTML = "";
        blocksData.forEach((data, idx) => {
          // Crear bloque (misma estructura que setupDynamicExpLogic)
          const block = document.createElement("div");
          block.className = "exp-block";
          block.innerHTML = `
                  <div class="exp-header" style="display:flex; justify-content:space-between; margin-bottom:5px; background:#f9f9f9; padding:5px;">
                     <strong>Experiencia ${idx + 1}</strong>
                     <button type="button" class="remove-exp cancel-btn" style="border:none; background:transparent; color:red; cursor:pointer;">✕</button>
                  </div>
                  <div class="form-grid">
                     <div><label>Empresa:</label><input type="text" class="empresa" value="${data.empresa || ''}"></div>
                     <div><label>Tipo:</label><select class="tipoEmpresa"><option value="">Seleccionar...</option><option value="PUBLICA" ${data.tipoEmpresa === 'PUBLICA' ? 'selected' : ''}>Pública</option><option value="PRIVADA" ${data.tipoEmpresa === 'PRIVADA' ? 'selected' : ''}>Privada</option></select></div>
                     <div><label>Cargo:</label><input type="text" class="cargo" value="${data.cargo || ''}"></div>
                     <div><label>Fecha Ingreso:</label><input type="date" class="fechaIngreso" value="${data.fechaIngreso || ''}"></div>
                     <div><label>Fecha Retiro:</label><input type="date" class="fechaRetiro" value="${data.fechaRetiro || ''}"></div>
                     <div><label>País:</label><input type="text" class="pais" value="${data.pais || ''}"></div>
                     <div><label>Depto:</label><input type="text" class="depto" value="${data.depto || ''}"></div>
                     <div><label>Municipio:</label><input type="text" class="municipio" value="${data.municipio || ''}"></div>
                     <div><label>Correo:</label><input type="email" class="correo" value="${data.correo || ''}"></div>
                     <div><label>Teléfono:</label><input type="text" class="telefono" value="${data.telefono || ''}"></div>
                     <div><label>Dependencia:</label><input type="text" class="dependencia" value="${data.dependencia || ''}"></div>
                     <div><label>Dirección:</label><input type="text" class="direccion" value="${data.direccion || ''}"></div>
                  </div>
               `;
          // Listener eliminar
          block.querySelector(".remove-exp").addEventListener("click", () => {
            block.remove();
            // updateLocalBtn... (simplificado: al restaurar asumimos que el usuario puede gestionar después)
            debouncedUpdate();
          });
          // Listeners inputs
          block.querySelectorAll("input, select").forEach(inp => inp.addEventListener("input", debouncedUpdate));
          container.appendChild(block);
        });
      };

      window._page2State.forEach((page, idx) => {
        // Si es Main (idx 0), solo restaurar datos
        if (idx === 0) {
          const container = document.getElementById(page.containerId);
          if (container && formData._page2Data && formData._page2Data[page.id]) {
            restoreExpBlocks(container, formData._page2Data[page.id]);
          }
        } else {
          // Es Extra: Recrear todo
          const uniqueId = page.id;
          const panelId = page.panelId;
          const tabId = page.tabId;
          const containerId = page.containerId;
          const numLabel = page.label;

          // CREAR TAB
          const newTab = document.createElement("button");
          newTab.id = tabId;
          newTab.className = "tab";
          newTab.role = "tab";
          newTab.setAttribute("aria-selected", "false");
          newTab.setAttribute("aria-controls", panelId);
          newTab.innerText = numLabel;
          if (tablist && tabP3) tablist.insertBefore(newTab, tabP3);

          // CREAR PANEL
          const newPanel = document.createElement("section");
          newPanel.id = panelId;
          newPanel.setAttribute("role", "tabpanel");
          newPanel.setAttribute("aria-labelledby", tabId);
          newPanel.hidden = true;
          newPanel.innerHTML = `
                <div class="panel-placeholder">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h2>EXPERIENCIA LABORAL (ADICIONAL)</h2>
                    <button type="button" class="btn-remove-page" onclick="removeExtraPage2('${uniqueId}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">
                      🗑️ Eliminar Página
                    </button>
                  </div>
                  <details class="section" open>
                    <summary>Experiencia Laboral (${numLabel})</summary>
                    <div id="${containerId}" class="exp-container"></div>
                    <button type="button" id="addExpBtn-${uniqueId}" class="add-exp">➕ Añadir experiencia</button>
                    <p class="hint" style="font-size: 12px; color: #555; margin-top: 8px">
                      Esta página permite agregar hasta 4 experiencias laborales adicionales.
                    </p>
                  </details>
                </div>
               `;
          if (extraPanels) extraPanels.appendChild(newPanel);

          // Restaurar datos del bloque
          const container = document.getElementById(containerId);
          if (container && formData._page2Data && formData._page2Data[uniqueId]) {
            restoreExpBlocks(container, formData._page2Data[uniqueId]);
          }

          // Re-bind botón añadir (usando setupDynamicExpLogic si es accesible, o inline)
          const addBtn = document.getElementById(`addExpBtn-${uniqueId}`);
          if (addBtn && container) {
            // Reutilizamos la lógica inline definida en addExtraPage2 (copiada aquí por scope)
            // O mejor, exponer setupDynamicExpLogic globalmente en el paso anterior
            if (typeof setupDynamicExpLogic === 'function') {
              setupDynamicExpLogic(container, addBtn, true);
            }
          }
        }
      });

      // Reinicializar tabs
      if (typeof setupTopTabs !== 'undefined') {
        setupTopTabs.init();
      }
    }
    // Fallback para datos antiguos (si existen bloques _expBlocks pero no _page2State)
    else if (formData._expBlocks && Array.isArray(formData._expBlocks) && formData._expBlocks.length > 0) {
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

    // Disparar evento change en trabajaActualmente para actualizar validaciones
    setTimeout(() => {
      const trabajaSel = document.getElementById("trabajaActualmente");
      if (trabajaSel && trabajaSel.value) {
        const event = new Event("change", { bubbles: true });
        trabajaSel.dispatchEvent(event);
      }
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
  return {
    // DATOS PERSONALES
    apellido1: document.getElementById("apellido1").value.toUpperCase(),
    apellido2: document.getElementById("apellido2").value.toUpperCase(),
    nombres: document.getElementById("nombres").value.toUpperCase(),
    documento: document.getElementById("documento").value.toUpperCase(),
    tipoDocumento: (
      document.getElementById("tipoDocumento")?.value || ""
    ).toUpperCase(),
    sexo: (document.getElementById("sexo")?.value || "").toUpperCase(),
    paisExtranjero: (paisInput?.value || "").toUpperCase(),
    libretaMilitar: (
      document.getElementById("libretaMilitar")?.value || ""
    ).toUpperCase(),
    numeroLibretaMilitar: (
      document.getElementById("numeroLibretaMilitar")?.value || ""
    ).toUpperCase(),
    distritoMilitar: (
      document.getElementById("distritoMilitar")?.value || ""
    ).toUpperCase(),
    fechaNacimiento: document.getElementById("fechaNacimiento").value,
    paisNacimiento: (
      document.getElementById("paisNacimiento")?.value || ""
    ).toUpperCase(),
    deptoNacimiento: (
      document.getElementById("deptoNacimiento")?.value || ""
    ).toUpperCase(),
    muniNacimiento: (
      document.getElementById("muniNacimiento")?.value || ""
    ).toUpperCase(),
    dirCorrespondecia: (
      document.getElementById("dirCorrespondecia")?.value || ""
    ).toUpperCase(),
    paisCorrespondecia: (
      document.getElementById("paisCorrespondecia")?.value || ""
    ).toUpperCase(),
    deptoCorrespondecia: (
      document.getElementById("deptoCorrespondecia")?.value || ""
    ).toUpperCase(),
    muniCorrespondecia: (
      document.getElementById("muniCorrespondecia")?.value || ""
    ).toUpperCase(),
    telCorrespondecia: (
      document.getElementById("telCorrespondecia")?.value || ""
    ).toUpperCase(),
    emailCorrespondecia: (
      document.getElementById("emailCorrespondecia")?.value || ""
    ).toLowerCase(),
    nacionalidadValor: (nacionalidad?.value || "").toUpperCase(),
    hostEmail: (
      document.getElementById("hostEmail")?.value || ""
    ).toLowerCase(),
    //FORMACION ACADEMICA Y OTROS CAMPOS SE AGREGAN AQUI
    nivelEducativo: (
      document.getElementById("nivelEducativo")?.value || ""
    ).toUpperCase(),
    tituloObtenidoBachiller: (
      document.getElementById("tituloObtenidoBachiller")?.value || ""
    ).toUpperCase(),
    fechaGradoBachiller: (
      document.getElementById("fechaGradoBachiller")?.value || ""
    ).toUpperCase(),
    // EDUCACION SUPERIOR
    //1er BLOQUE
    modalidadAcademica: (
      document.getElementById("modalidadAcademica")?.value || ""
    ).toUpperCase(),
    semestresAprobados: (
      document.getElementById("semestresAprobados")?.value || ""
    ).toUpperCase(),
    graduado: (document.getElementById("graduado")?.value || "").toUpperCase(),
    tituloObtenidoSuperior: (
      document.getElementById("tituloObtenidoSuperior")?.value || ""
    ).toUpperCase(),
    fechaGradoSuperior: (
      document.getElementById("fechaGradoSuperior")?.value || ""
    ).toUpperCase(),
    tarjetaProfesional: (
      document.getElementById("tarjetaProfesional")?.value || ""
    ).toUpperCase(),
    //2do BLOQUE
    modalidadAcademica2: (
      document.getElementById("modalidadAcademica2")?.value || ""
    ).toUpperCase(),
    semestresAprobados2: (
      document.getElementById("semestresAprobados2")?.value || ""
    ).toUpperCase(),
    graduado2: (
      document.getElementById("graduado2")?.value || ""
    ).toUpperCase(),
    tituloObtenidoSuperior2: (
      document.getElementById("tituloObtenidoSuperior2")?.value || ""
    ).toUpperCase(),
    fechaGradoSuperior2: (
      document.getElementById("fechaGradoSuperior2")?.value || ""
    ).toUpperCase(),
    tarjetaProfesional2: (
      document.getElementById("tarjetaProfesional2")?.value || ""
    ).toUpperCase(),
    //3er BLOQUE
    modalidadAcademica3: (
      document.getElementById("modalidadAcademica3")?.value || ""
    ).toUpperCase(),
    semestresAprobados3: (
      document.getElementById("semestresAprobados3")?.value || ""
    ).toUpperCase(),
    graduado3: (
      document.getElementById("graduado3")?.value || ""
    ).toUpperCase(),
    tituloObtenidoSuperior3: (
      document.getElementById("tituloObtenidoSuperior3")?.value || ""
    ).toUpperCase(),
    fechaGradoSuperior3: (
      document.getElementById("fechaGradoSuperior3")?.value || ""
    ).toUpperCase(),
    tarjetaProfesional3: (
      document.getElementById("tarjetaProfesional3")?.value || ""
    ).toUpperCase(),
    //4to BLOQUE
    modalidadAcademica4: (
      document.getElementById("modalidadAcademica4")?.value || ""
    ).toUpperCase(),
    semestresAprobados4: (
      document.getElementById("semestresAprobados4")?.value || ""
    ).toUpperCase(),
    graduado4: (
      document.getElementById("graduado4")?.value || ""
    ).toUpperCase(),
    tituloObtenidoSuperior4: (
      document.getElementById("tituloObtenidoSuperior4")?.value || ""
    ).toUpperCase(),
    fechaGradoSuperior4: (
      document.getElementById("fechaGradoSuperior4")?.value || ""
    ).toUpperCase(),
    tarjetaProfesional4: (
      document.getElementById("tarjetaProfesional4")?.value || ""
    ).toUpperCase(),
    // 5to BLOQUE
    modalidadAcademica5: (
      document.getElementById("modalidadAcademica5")?.value || ""
    ).toUpperCase(),
    semestresAprobados5: (
      document.getElementById("semestresAprobados5")?.value || ""
    ).toUpperCase(),
    graduado5: (
      document.getElementById("graduado5")?.value || ""
    ).toUpperCase(),
    tituloObtenidoSuperior5: (
      document.getElementById("tituloObtenidoSuperior5")?.value || ""
    ).toUpperCase(),
    fechaGradoSuperior5: (
      document.getElementById("fechaGradoSuperior5")?.value || ""
    ).toUpperCase(),
    tarjetaProfesional5: (
      document.getElementById("tarjetaProfesional5")?.value || ""
    ).toUpperCase(),
    //Idiomas
    // idioma1
    idioma1: (document.getElementById("idioma1")?.value || "").toUpperCase(),
    loHabla1: (document.getElementById("loHabla1")?.value || "").toUpperCase(),
    loLee1: (document.getElementById("loLee1")?.value || "").toUpperCase(),
    loEscribe1: (
      document.getElementById("loEscribe1")?.value || ""
    ).toUpperCase(),
    // idioma2
    idioma2: (document.getElementById("idioma2")?.value || "").toUpperCase(),
    loHabla2: (document.getElementById("loHabla2")?.value || "").toUpperCase(),
    loLee2: (document.getElementById("loLee2")?.value || "").toUpperCase(),
    loEscribe2: (
      document.getElementById("loEscribe2")?.value || ""
    ).toUpperCase(),
  };
}

// Construye el PDF y devuelve ArrayBuffer de bytes
// Función principal que construye el PDF usando datos del formulario
async function buildPdfBytes() {
  const v = collectFormValues();
  return buildPdfBytesFromData(v);
}

// Función interna que construye el PDF a partir de datos específicos
async function buildPdfBytesFromData(v) {
  const { PDFDocument, rgb } = PDFLib;
  // Resolver ruta del PDF base de forma robusta
  // 1) Meta explícita en la página de la herramienta
  const metaPdf = document.querySelector('meta[name="pdf-base"]')?.content;
  let pdfUrlCandidates = [];
  if (metaPdf) {
    try { pdfUrlCandidates.push(new URL(metaPdf, window.location.href).href); } catch { }
  }
  // 2) Candidatos comunes por compatibilidad
  try {
    pdfUrlCandidates.push(new URL("./formatounico.pdf", window.location.href).href);
  } catch { }
  try {
    // prefer root PDF (kept for compatibility)
    pdfUrlCandidates.push(new URL("./formatounico.pdf", window.location.href).href);
  } catch { }
  try {
    const scripts = Array.from(document.getElementsByTagName("script"));
    const self = scripts.find((s) => (s.src || "").includes("script.js")) || document.currentScript;
    if (self?.src) {
      // allow candidate relative to script location as last resort
      pdfUrlCandidates.push(new URL("formatounico.pdf", self.src).href);
    }
  } catch { }
  // De-duplicar manteniendo orden
  pdfUrlCandidates = Array.from(new Set(pdfUrlCandidates));
  let existingPdfBytes = null;
  let lastErr = null;
  for (const url of pdfUrlCandidates) {
    try {
      const res = await fetch(url);
      if (res.ok) { existingPdfBytes = await res.arrayBuffer(); break; }
      lastErr = new Error("No se pudo cargar: " + url + " (" + res.status + ")");
    } catch (e) { lastErr = e; }
  }
  if (!existingPdfBytes) {
    throw lastErr || new Error("No se pudo localizar el PDF base");
  }
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[0];
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const color = rgb(0, 0, 0);

  page.drawText(s(v.apellido1).substring(0, 20), { x: 65, y: 605, size: 10, font, color });
  page.drawText(s(v.apellido2).substring(0, 20), { x: 230, y: 605, size: 10, font, color });
  page.drawText(s(v.nombres).substring(0, 30), { x: 400, y: 605, size: 10, font, color });

  if (v.tipoDocumento === "CC")
    page.drawText("X", { x: 83, y: 574, size: 10, font, color });
  else if (v.tipoDocumento === "CE")
    page.drawText("X", { x: 113, y: 574, size: 10, font, color });
  else if (v.tipoDocumento === "PA")
    page.drawText("X", { x: 148, y: 574, size: 10, font, color });
  page.drawText(s(v.documento).substring(0, 15), { x: 185, y: 575, size: 10, font, color });

  if (v.sexo === "M")
    page.drawText("X", { x: 340, y: 575, size: 10, font, color });
  else if (v.sexo === "F")
    page.drawText("X", { x: 318, y: 575, size: 10, font, color });

  if (v.nacionalidadValor === "COLOMBIANA")
    page.drawText("X", { x: 383, y: 575, size: 10, font, color });
  else if (v.nacionalidadValor === "EXTRANJERA")
    page.drawText("X", { x: 457, y: 575, size: 10, font, color });
  if (v.nacionalidadValor === "EXTRANJERA" && v.paisExtranjero) {
    page.drawText(s(v.paisExtranjero).substring(0, 25), { x: 474, y: 575, size: 9, font, color });
  }

  if (v.libretaMilitar === "PRIMERA")
    page.drawText("X", { x: 146, y: 544, size: 10, font, color });
  else if (v.libretaMilitar === "SEGUNDA")
    page.drawText("X", { x: 262, y: 544, size: 10, font, color });
  page.drawText(s(v.numeroLibretaMilitar).substring(0, 12), {
    x: 338,
    y: 545,
    size: 10,
    font,
    color,
  });
  page.drawText(s(v.distritoMilitar).substring(0, 15), { x: 495, y: 545, size: 9, font, color });

  if (v.fechaNacimiento) {
    const fecha = new Date(v.fechaNacimiento);
    const dia = String(fecha.getUTCDate()).padStart(2, "0");
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const anio = fecha.getFullYear();
    page.drawText(dia, { x: 139, y: 508, size: 10, font, color });
    page.drawText(mes, { x: 188, y: 508, size: 10, font, color });
    page.drawText(anio.toString(), { x: 240, y: 508, size: 10, font, color });
  }

  // if (v.hostEmail && v.emailCorrespondecia) {
  //   v.emailCorrespondecia = v.emailCorrespondecia + v.hostEmail;
  // }

  page.drawText(s(v.paisNacimiento).substring(0, 20), { x: 118, y: 490, size: 9, font, color });
  page.drawText(s(v.deptoNacimiento).substring(0, 20), { x: 118, y: 472, size: 9, font, color });
  page.drawText(s(v.muniNacimiento).substring(0, 20), { x: 118, y: 455, size: 9, font, color });

  // Truncar dirección si es muy larga (máximo 50 caracteres)
  const dirTruncada = s(v.dirCorrespondecia).substring(0, 50);
  page.drawText(dirTruncada, { x: 292, y: 508, size: 9, font, color });

  page.drawText(s(v.paisCorrespondecia).substring(0, 30), {
    x: 317,
    y: 490,
    size: 9,
    font,
    color,
  });
  page.drawText(s(v.deptoCorrespondecia).substring(0, 20), {
    x: 473,
    y: 490,
    size: 9,
    font,
    color,
  });
  page.drawText(s(v.muniCorrespondecia).substring(0, 20), {
    x: 344,
    y: 473,
    size: 9,
    font,
    color,
  });
  page.drawText(s(v.telCorrespondecia).substring(0, 20), { x: 344, y: 455, size: 9, font, color });

  // Email: truncar si es muy largo
  const emailTruncada = s(v.emailCorrespondecia).substring(0, 35);
  page.drawText(emailTruncada, {
    x: 473,
    y: 470,
    size: 7,
    font,
    color,
  });

  // Host email (dominio)
  const hostTruncado = s(v.hostEmail).substring(0, 20);
  page.drawText(hostTruncado, { x: 473, y: 455, size: 7, font, color });

  //FORMACION ACADEMICA Y OTROS CAMPOS SE DIBUJAN AQUI
  // Nivel educativo (marcado de check en línea de opciones y datos de bachillerato)
  switch (v.nivelEducativo) {
    case "1":
      page.drawText("X", { x: 103, y: 320, size: 10, font, color });
      break;
    case "2":
      page.drawText("X", { x: 120, y: 320, size: 10, font, color });
      break;
    case "3":
      page.drawText("X", { x: 137, y: 320, size: 10, font, color });
      break;
    case "4":
      page.drawText("X", { x: 154, y: 320, size: 10, font, color });
      break;
    case "5":
      page.drawText("X", { x: 171, y: 320, size: 10, font, color });
      break;
    case "6":
      page.drawText("X", { x: 188, y: 320, size: 10, font, color });
      break;
    case "7":
      page.drawText("X", { x: 205, y: 320, size: 10, font, color });
      break;
    case "8":
      page.drawText("X", { x: 223, y: 320, size: 10, font, color });
      break;
    case "9":
      page.drawText("X", { x: 240, y: 320, size: 10, font, color });
      break;
    case "10":
      page.drawText("X", { x: 257, y: 320, size: 10, font, color });
      break;
    case "11":
      page.drawText("X", { x: 274, y: 320, size: 10, font, color });
      // Truncar título si es muy largo para que quepa en el PDF
      const tituloBachillerTruncado = s(v.tituloObtenidoBachiller).substring(0, 40);
      page.drawText(tituloBachillerTruncado, {
        x: 361,
        y: 350,
        size: 8,
        font,
        color,
      });
      const fechaBach = v.fechaGradoBachiller
        ? new Date(v.fechaGradoBachiller)
        : null;
      const anioBach = fechaBach ? fechaBach.getFullYear().toString() : "";
      page.drawText(anioBach, { x: 418, y: 320, size: 10, font, color });
      const mesBach = fechaBach
        ? String(fechaBach.getMonth() + 1).padStart(2, "0")
        : "";
      page.drawText(mesBach, { x: 353, y: 320, size: 10, font, color });
      break;
    default:
      break;
  }
  // Educación superior dinámica (hasta 5 filas)
  // baseY/step controlan la separación vertical por fila; ajusta x de columnas en cada drawText si cambias diseño.
  // Columnas (x): modalidad 70 | semestres 130 | graduado SI 183 / NO 208 | título 225 | mes 430 | año 460 | tarjeta 505
  const items = (v.educacionSuperior || []).slice(0, 5);
  let baseY = 200; // primera fila
  const step = 16; // separación vertical por fila
  items.forEach((it, idx) => {
    const y = baseY - idx * step;
    page.drawText(s(it.modalidad).substring(0, 25), { x: 70, y, size: 9, font, color });
    page.drawText(s(it.semestres).substring(0, 10), { x: 130, y, size: 9, font, color });
    if ((it.graduado || "") === "SI")
      page.drawText("X", { x: 183, y, size: 10, font, color });
    else if ((it.graduado || "") === "NO")
      page.drawText("X", { x: 208, y, size: 10, font, color });
    // Nota: tamaño 7 para el título y truncado a 35 caracteres para que quepa en la celda
    const tituloTruncado = s(it.titulo).substring(0, 35);
    page.drawText(tituloTruncado, {
      x: 225,
      y: y + 1.5,
      size: 7,
      font,
      color,
    });
    if (it.fecha) {
      const f = new Date(it.fecha);
      if (!isNaN(f)) {
        const anio = String(f.getFullYear());
        const mes = String(f.getMonth() + 1).padStart(2, "0");
        page.drawText(mes, { x: 430, y, size: 10, font, color });
        page.drawText(anio, { x: 460, y, size: 10, font, color });
      }
    }
    // Tarjeta profesional truncada a 15 caracteres
    const tarjetaTruncada = s(it.tarjeta).substring(0, 15);
    page.drawText(tarjetaTruncada, { x: 505, y, size: 8, font, color });
  });
  // IDIOMAS dinámicos (máx 2 filas en el PDF)
  // baseYIdiomas/stepIdiomas controlan la separación de filas; ver cabecera del archivo para mapeo de columnas.
  const idiomas = (v.idiomas || []).slice(0, 2);
  const baseYIdiomas = 72; // primera fila
  const stepIdiomas = 17; // separación vertical (coincide con 72 -> 55)
  idiomas.forEach((it, idx) => {
    const y = baseYIdiomas - idx * stepIdiomas;
    // Truncar nombre de idioma a 20 caracteres
    const idiomaTruncado = s(it.idioma).substring(0, 20);
    page.drawText(idiomaTruncado, { x: 160, y, size: 9, font, color });
    // habla
    switch (it.habla) {
      case "REGULAR":
        page.drawText("X", { x: 305, y, size: 10, font, color });
        break;
      case "BIEN":
        page.drawText("X", { x: 320, y, size: 10, font, color });
        break;
      case "MUYBIEN":
        page.drawText("X", { x: 338, y, size: 10, font, color });
        break;
      default:
        break;
    }
    // lee
    switch (it.lee) {
      case "REGULAR":
        page.drawText("X", { x: 355, y, size: 10, font, color });
        break;
      case "BIEN":
        page.drawText("X", { x: 370, y, size: 10, font, color });
        break;
      case "MUYBIEN":
        page.drawText("X", { x: 388, y, size: 10, font, color });
        break;
      default:
        break;
    }
    // escribe
    switch (it.escribe) {
      case "REGULAR":
        page.drawText("X", { x: 405, y, size: 10, font, color });
        break;
      case "BIEN":
        page.drawText("X", { x: 422, y, size: 10, font, color });
        break;
      case "MUYBIEN":
        page.drawText("X", { x: 440, y, size: 10, font, color });
        break;
      default:
        break;
    }
  });

  // --- Página 2 y 3: Preparación y dibujo inicial (coordenadas a ajustar) ---
  // const pages = pdfDoc.getPages(); // Ya declarada arriba
  let page2 = pages[1];
  let page3 = pages[2];

  // Asegurar que existan (por si el PDF base está corrupto o incompleto)
  if (!page2) page2 = pdfDoc.addPage();
  if (!page3) page3 = pdfDoc.addPage();

  // Helper para dibujar experiencias en una página dada
  const drawExperiencesOnPage = (targetPage, expList, isMainPage) => {
    const baseTopY = 552; // línea empresa/entidad de la primera experiencia
    const blockStep = 130; // distancia vertical entre experiencias
    const offsets = { empresa: 0, linea2: -30, fechas: -60, linea4: -90 };

    function drawFecha(y, fechaStr, xD, xM, xA) {
      if (!fechaStr) return;
      const fecha = new Date(fechaStr);
      if (isNaN(fecha)) return;
      const dia = String(fecha.getUTCDate()).padStart(2, "0");
      const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
      const anio = String(fecha.getUTCFullYear());
      targetPage.drawText(dia, { x: xD, y, size: 10, font, color });
      targetPage.drawText(mes, { x: xM, y, size: 10, font, color });
      targetPage.drawText(anio, { x: xA, y, size: 10, font, color });
    }

    // Para la Main (idx 0), aplica la lógica de "Empleo Actual" que desplaza el inicio
    // Para las Extras, SIEMPRE empieza arriba (offset 0)
    let startRowOffset = 0;
    if (isMainPage) {
      startRowOffset = v.trabajaActualmente ? 0 : 1;
    }

    // Dibujar hasta 4 items (la capacidad ya viene paddeada/truncada en getFormData, pero aseguramos)
    expList.slice(0, 4).forEach((e, idx) => {
      // Si es MainPage y startRowOffset es 1, el idx 0 se dibuja en la posición visual 1 (y así sucesiv.)
      // Si NO es Main, startRowOffset es 0, el idx 0 se dibuja en pos 0.

      const visualRowIndex = idx + startRowOffset;
      if (visualRowIndex >= 4) return; // Safety check

      const topY = baseTopY - visualRowIndex * blockStep;

      // Línea 1: Empresa, tipo, país
      // Truncar empresa a 30 caracteres
      targetPage.drawText(s(e.empresa).substring(0, 30), { x: 65, y: topY, size: 9, font, color });
      if (e.tipoEmpresa === "PUBLICA")
        targetPage.drawText("X", { x: 345, y: topY, size: 10, font, color });
      else if (e.tipoEmpresa === "PRIVADA")
        targetPage.drawText("X", { x: 390, y: topY, size: 10, font, color });
      // Truncar país a 20 caracteres
      targetPage.drawText(s(e.pais).substring(0, 20), { x: 425, y: topY, size: 9, font, color });

      // Línea 2: Depto, municipio, correo
      const y2 = topY + offsets.linea2;
      targetPage.drawText(s(e.depto).substring(0, 20), { x: 65, y: y2, size: 9, font, color });
      targetPage.drawText(s(e.municipio).substring(0, 20), { x: 242, y: y2, size: 9, font, color });
      targetPage.drawText(s(e.correo).substring(0, 25), { x: 412, y: y2, size: 6, font, color });

      // Línea 3: Teléfono, fechas ingreso/retiro
      const y3 = topY + offsets.fechas;
      targetPage.drawText(s(e.telefono).substring(0, 15), { x: 65, y: y3, size: 9, font, color });
      drawFecha(y3, e.fechaIngreso, 263, 312, 362);
      drawFecha(y3, e.fechaRetiro, 430, 479, 529);

      // Línea 4: Cargo, dependencia, dirección
      const y4 = topY + offsets.linea4;
      targetPage.drawText(s(e.cargo).substring(0, 25), { x: 65, y: y4, size: 9, font, color });
      targetPage.drawText(s(e.dependencia).substring(0, 20), { x: 243, y: y4, size: 9, font, color });
      targetPage.drawText(s(e.direccion).substring(0, 25), { x: 410, y: y4, size: 9, font, color });
    });
  };

  // PÁGINA 2 (Principal e instancias extra)
  // v.experiencias es Array de Arrays
  if (v.experiencias && v.experiencias.length > 0) {
    // 1. Dibujar en la P2 original (Main)
    drawExperiencesOnPage(page2, v.experiencias[0], true);

    // 2. Crear e insertar páginas extra si existen
    for (let i = 1; i < v.experiencias.length; i++) {
      // Copiar la página 2 original (índice 1 en el PDF original)
      // copyPages es asíncrono y devuelve array
      const [newPage] = await pdfDoc.copyPages(pdfDoc, [1]);
      // Insertar después de la última página 2 procesada
      // Original P2 es index 1. La primera extra (i=1) va en index 2.
      pdfDoc.insertPage(1 + i, newPage);

      drawExperiencesOnPage(newPage, v.experiencias[i], false);
    }
  } else {
    // Si no hay datos (raro), dejar la P2 original en blanco o dibujar vacío
    // No hacemos nada, queda la P2 original limpia.
  }

  // PÁGINA 3: Campos de firma/no inhabilidad
  if (page3) {
    const data3 = v.hoja3 || {};
    page3.drawText(data3.servidorPublicoAnios, {
      x: 390,
      y: 595,
      size: 10,
      font,
      color,
    });

    page3.drawText(data3.servidorPublicoMeses, {
      x: 460,
      y: 595,
      size: 10,
      font,
      color,
    });

    page3.drawText(data3.servidorPrivadoAnios, {
      x: 390,
      y: 570,
      size: 10,
      font,
      color,
    });

    page3.drawText(data3.servidorPrivadoMeses, {
      x: 460,
      y: 570,
      size: 10,
      font,
      color,
    });

    page3.drawText(data3.trabajadorIndependienteAnios, {
      x: 390,
      y: 545,
      size: 10,
      font,
      color,
    });

    page3.drawText(data3.trabajadorIndependienteMeses, {
      x: 460,
      y: 545,
      size: 10,
      font,
      color,
    });

    const totalMeses =
      Number(data3?.trabajadorIndependienteMeses) +
      Number(data3?.servidorPublicoMeses) +
      Number(data3?.servidorPrivadoMeses);

    page3.drawText(`${totalMeses}`, {
      x: 460,
      y: 516,
      size: 10,
      font,
      color,
    });

    const totalAnios =
      Number(data3?.trabajadorIndependienteAnios) +
      Number(data3?.servidorPublicoAnios) +
      Number(data3?.servidorPrivadoAnios);

    page3.drawText(`${totalAnios}`, {
      x: 390,
      y: 516,
      size: 10,
      font,
      color,
    });

    if (data3.Noinhabilidad === "SI") {
      page3.drawText("X", { x: 270, y: 420, size: 10, font, color });
    }
    if (data3.Noinhabilidad === "NO") {
      page3.drawText("X", { x: 302, y: 420, size: 10, font, color });
    }

    let fecha;
    if (data3.fechaFirma) {
      // Si el usuario ingresó una fecha personalizada (YYYY-MM-DD)
      fecha = new Date(data3.fechaFirma);
    } else {
      // Si no, usar la fecha actual
      fecha = new Date();
    }
    const dia = String(fecha.getUTCDate()).padStart(2, "0");
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
    const anio = fecha.getUTCFullYear();
    const fechaFinal = `${dia}/${mes}/${anio}`;
    // Truncar lugar a 25 caracteres para que quepa en el PDF
    const lugarTruncado = s(data3.lugarFirma).substring(0, 25);
    page3.drawText(lugarTruncado + ", " + fechaFinal, {
      x: 220,
      y: 338,
      size: 9,
      font,
      color,
    });

    if (data3.imgFirma) {
      try {
        let embeddedImg = null;
        // Caso 1: es un File del input[type=file]
        if (typeof data3.imgFirma !== 'string' && data3.imgFirma.arrayBuffer) {
          const ab = await data3.imgFirma.arrayBuffer();
          const mime = (data3.imgFirma.type || '').toLowerCase();
          if (mime.includes('png')) embeddedImg = await pdfDoc.embedPng(ab);
          else embeddedImg = await pdfDoc.embedJpg(ab);
        } else if (typeof data3.imgFirma === 'string') {
          // Caso 2: podría ser una data URL o URL remota
          try {
            const resp = await fetch(data3.imgFirma);
            const ab = await resp.arrayBuffer();
            const mime = (resp.headers.get('content-type') || '').toLowerCase();
            if (mime.includes('png')) embeddedImg = await pdfDoc.embedPng(ab);
            else embeddedImg = await pdfDoc.embedJpg(ab);
          } catch (_) { /* ignorar si no se pudo fetchear */ }
        }
        if (embeddedImg) {
          // Escalado manteniendo proporción a un cuadro máximo
          // const maxW = 140, maxH = 50;
          // const scale = Math.min(maxW / embeddedImg.width, maxH / embeddedImg.height, 1);
          // const drawW = embeddedImg.width * scale;
          // const drawH = embeddedImg.height * scale;
          page3.drawImage(embeddedImg, {
            x: 250,
            y: 300,
            width: 120,
            height: 30,
          });
        }
      } catch (imgErr) {
        console.warn('No se pudo insertar la firma:', imgErr);
      }
    }
  }

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

    // Identificar cuál página 2 estamos dibujando (Main, 2.1, 2.2...)
    // Default a 0 (Main) si no está definido
    const pageIdx = (typeof window._activePage2Index !== 'undefined') ? window._activePage2Index : 0;

    // Obtener los datos específicos de esa página
    // v.experiencias es ahora Array de Arrays
    let pageData = [];
    if (v.experiencias && v.experiencias[pageIdx]) {
      pageData = v.experiencias[pageIdx];
    }

    // Para la Main (idx 0), aplica la lógica de "Empleo Actual" que desplaza el inicio
    // Para las Extras (idx > 0), SIEMPRE empieza arriba (offset 0) porque tienen capacidad 4 fija
    let startRowOffset = 0;
    if (pageIdx === 0) {
      startRowOffset = v.trabajaActualmente ? 0 : 1;
    }

    pageData.forEach((e, idx) => {
      // Ajustar Y basado en el offset
      const topY = baseTopY - (idx + startRowOffset) * blockStep;

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
  drawCanvasOverlay(ctx, formData, _currentPreviewPage, canvas.width, canvas.height);

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

  // Experiencias dinámicas (multipage support)
  v.experiencias = [];

  if (window._page2State && Array.isArray(window._page2State)) {
    window._page2State.forEach((pageState) => {
      const container = document.getElementById(pageState.containerId);
      const pageExps = [];
      if (container) {
        container.querySelectorAll(".exp-block").forEach((block) => {
          pageExps.push({
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
      }

      // Lógica de capacidad y padding por página
      const isMain = pageState.type === "main";
      const trabajaCurrently = (document.getElementById("trabajaActualmente")?.value || "").toUpperCase();
      // Capacidad: 3 si es Main y NO trabaja actualmente (se salta renglón 1), sino 4.
      // Páginas extra siempre 4.
      let capacity = 4;
      if (isMain && trabajaCurrently === "NO") {
        capacity = 3;
      }

      // Truncar si excede capacidad visual
      const validExps = pageExps.slice(0, capacity);

      // Rellenar con objetos vacíos para mantener estructura uniforme
      while (validExps.length < capacity) {
        validExps.push({
          empresa: "", tipoEmpresa: "", pais: "", depto: "", municipio: "",
          correo: "", telefono: "", fechaIngreso: "", fechaRetiro: "",
          cargo: "", dependencia: "", direccion: ""
        });
      }

      v.experiencias.push(validExps);
    });
  }

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

function goToPreviewPage(page) {
  if (page < 1 || page > 3) return;
  if (_currentPreviewPage === page) return;
  _currentPreviewPage = page;
  updateDesktopPreview();
}

// Auto-switch page based on focus
document.getElementById("formulario")?.addEventListener("focusin", (e) => {
  const target = e.target;
  // Encontrar en qué panel está el input
  const panel = target.closest("section[role='tabpanel']");
  if (!panel) return;

  const panelId = panel.id;
  if (panelId === "panel-p1") {
    goToPreviewPage(1);
  } else if (panelId === "panel-p2") {
    goToPreviewPage(2);
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

// Leer educación superior dinámica en collectFormValues
const _oldCollect = collectFormValues;
collectFormValues = function () {
  const v = _oldCollect();
  const container = document.getElementById("eduContainer");
  v.educacionSuperior = [];
  if (container) {
    container.querySelectorAll(".edu-block").forEach((block) => {
      v.educacionSuperior.push({
        modalidad: (
          block.querySelector(".modalidad")?.value || ""
        ).toUpperCase(),
        semestres: (
          block.querySelector(".semestres")?.value || ""
        ).toUpperCase(),
        graduado: (block.querySelector(".graduado")?.value || "").toUpperCase(),
        titulo: (block.querySelector(".titulo")?.value || "").toUpperCase(),
        fecha: block.querySelector(".fecha")?.value || "",
        tarjeta: (block.querySelector(".tarjeta")?.value || "").toUpperCase(),
      });
    });
  }
  // Idiomas dinámicos
  v.idiomas = [];
  const idiomasContainer = document.getElementById("idiomasContainer");
  if (idiomasContainer) {
    idiomasContainer.querySelectorAll(".idioma-block").forEach((block) => {
      v.idiomas.push({
        idioma: (
          block.querySelector(".idioma-nombre")?.value || ""
        ).toUpperCase(),
        habla: (
          block.querySelector(".idioma-habla")?.value || ""
        ).toUpperCase(),
        lee: (block.querySelector(".idioma-lee")?.value || "").toUpperCase(),
        escribe: (
          block.querySelector(".idioma-escribe")?.value || ""
        ).toUpperCase(),
      });
    });
  }
  // Experiencia laboral página 2 (bloque estático inicial)
  v.experiencias = [];
  const exp1 = {
    empresa: (document.getElementById("empresa1")?.value || "").toUpperCase(),
    tipoEmpresa: (
      document.getElementById("tipoEmpresa1")?.value || ""
    ).toUpperCase(),
    pais: (document.getElementById("pais1")?.value || "").toUpperCase(),
    depto: (document.getElementById("deptoExpe1")?.value || "").toUpperCase(),
    municipio: (
      document.getElementById("municiExpe1")?.value || ""
    ).toUpperCase(),
    correo: (document.getElementById("correoExpe1")?.value || "").toLowerCase(),
    telefono: (
      document.getElementById("telefExpe1")?.value || ""
    ).toUpperCase(),
    fechaIngreso: document.getElementById("fechaIngreso1")?.value || "",
    fechaRetiro: document.getElementById("fechaRetiro1")?.value || "",
    cargo: (document.getElementById("cargo1")?.value || "").toUpperCase(),
    dependencia: (
      document.getElementById("dependencia1")?.value || ""
    ).toUpperCase(),
    direccion: (
      document.getElementById("direccion1")?.value || ""
    ).toUpperCase(),
  };
  if (exp1.empresa || exp1.cargo || exp1.fechaIngreso)
    v.experiencias.push(exp1);

  const exp2 = {
    empresa: (document.getElementById("empresa2")?.value || "").toUpperCase(),
    tipoEmpresa: (
      document.getElementById("tipoEmpresa2")?.value || ""
    ).toUpperCase(),
    pais: (document.getElementById("pais2")?.value || "").toUpperCase(),
    depto: (document.getElementById("deptoExpe2")?.value || "").toUpperCase(),
    municipio: (
      document.getElementById("municiExpe2")?.value || ""
    ).toUpperCase(),
    correo: (document.getElementById("correoExpe2")?.value || "").toLowerCase(),
    telefono: (
      document.getElementById("telefExpe2")?.value || ""
    ).toUpperCase(),
    fechaIngreso: document.getElementById("fechaIngreso2")?.value || "",
    fechaRetiro: document.getElementById("fechaRetiro2")?.value || "",
    cargo: (document.getElementById("cargo2")?.value || "").toUpperCase(),
    dependencia: (
      document.getElementById("dependencia2")?.value || ""
    ).toUpperCase(),
    direccion: (
      document.getElementById("direccion2")?.value || ""
    ).toUpperCase(),
  };
  if (exp2.empresa || exp2.cargo || exp2.fechaIngreso)
    v.experiencias.push(exp2);

  const exp3 = {
    empresa: (document.getElementById("empresa3")?.value || "").toUpperCase(),
    tipoEmpresa: (
      document.getElementById("tipoEmpresa3")?.value || ""
    ).toUpperCase(),
    pais: (document.getElementById("pais3")?.value || "").toUpperCase(),
    depto: (document.getElementById("deptoExpe3")?.value || "").toUpperCase(),
    municipio: (
      document.getElementById("municiExpe3")?.value || ""
    ).toUpperCase(),
    correo: (document.getElementById("correoExpe3")?.value || "").toLowerCase(),
    telefono: (
      document.getElementById("telefExpe3")?.value || ""
    ).toUpperCase(),
    fechaIngreso: document.getElementById("fechaIngreso3")?.value || "",
    fechaRetiro: document.getElementById("fechaRetiro3")?.value || "",
    cargo: (document.getElementById("cargo3")?.value || "").toUpperCase(),
    dependencia: (
      document.getElementById("dependencia3")?.value || ""
    ).toUpperCase(),
    direccion: (
      document.getElementById("direccion3")?.value || ""
    ).toUpperCase(),
  };
  if (exp3.empresa || exp3.cargo || exp3.fechaIngreso)
    v.experiencias.push(exp3);

  const exp4 = {
    empresa: (document.getElementById("empresa4")?.value || "").toUpperCase(),
    tipoEmpresa: (
      document.getElementById("tipoEmpresa4")?.value || ""
    ).toUpperCase(),
    pais: (document.getElementById("pais4")?.value || "").toUpperCase(),
    depto: (document.getElementById("deptoExpe4")?.value || "").toUpperCase(),
    municipio: (
      document.getElementById("municiExpe4")?.value || ""
    ).toUpperCase(),
    correo: (document.getElementById("correoExpe4")?.value || "").toLowerCase(),
    telefono: (
      document.getElementById("telefExpe4")?.value || ""
    ).toUpperCase(),
    fechaIngreso: document.getElementById("fechaIngreso4")?.value || "",
    fechaRetiro: document.getElementById("fechaRetiro4")?.value || "",
    cargo: (document.getElementById("cargo4")?.value || "").toUpperCase(),
    dependencia: (
      document.getElementById("dependencia4")?.value || ""
    ).toUpperCase(),
    direccion: (
      document.getElementById("direccion4")?.value || ""
    ).toUpperCase(),
  };
  if (exp4.empresa || exp4.cargo || exp4.fechaIngreso)
    v.experiencias.push(exp4);

  // Hoja 3 (firma/no inhabilidad): usar un único objeto en v.hoja3
  v.hoja3 = {
    servidorPublicoAnios: (
      document.getElementById("servidorPublicoAnios")?.value || ""
    ).toUpperCase(),
    servidorPublicoMeses: (
      document.getElementById("servidorPublicoMeses")?.value || ""
    ).toUpperCase(),
    servidorPrivadoAnios: (
      document.getElementById("servidorPrivadoAnios")?.value || ""
    ).toUpperCase(),
    servidorPrivadoMeses: (
      document.getElementById("servidorPrivadoMeses")?.value || ""
    ).toUpperCase(),
    trabajadorIndependienteAnios: (
      document.getElementById("trabajadorIndependienteAnios")?.value || ""
    ).toUpperCase(),
    trabajadorIndependienteMeses: (
      document.getElementById("trabajadorIndependienteMeses")?.value || ""
    ).toUpperCase(),
    Noinhabilidad: (
      document.getElementById("Noinhabilidad")?.value || ""
    ).toUpperCase(),
    lugarFirma: (
      document.getElementById("lugarFirma")?.value || ""
    ).toUpperCase(),
    fechaFirma: document.getElementById("fechaFirma")?.value || "",
    imgFirma: (document.getElementById("imgFirma") && document.getElementById("imgFirma").files && document.getElementById("imgFirma").files[0]) ? document.getElementById("imgFirma").files[0] : "",
  };

  return v;
};

// (Eliminado override de buildPdfBytes: ahora el dibujo dinámico está integrado
// directamente en la función buildPdfBytes original más arriba.)

// -----------------------
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
(function setupTopTabs() {
  const tab1 = document.getElementById("tab-p1");
  const tab2 = document.getElementById("tab-p2");
  const tab3 = document.getElementById("tab-p3");
  const panel1 = document.getElementById("panel-p1");
  const panel2 = document.getElementById("panel-p2");
  const panel3 = document.getElementById("panel-p3");
  if (!tab1 || !tab2 || !tab3 || !panel1 || !panel2 || !panel3) return;

  const tabs = [tab1, tab2, tab3];
  const panels = [panel1, panel2, panel3];

  function activate(index) {
    tabs.forEach((t, i) => {
      const selected = i === index;
      t.classList.toggle("active", selected);
      t.setAttribute("aria-selected", selected ? "true" : "false");
      panels[i].hidden = !selected;
    });
    // Sincronizar con la vista previa optimizada
    goToPreviewPage(index + 1);

    const dlBtn = document.getElementById("downloadPdfBtn");
    if (dlBtn) dlBtn.style.display = index === 2 ? "inline-block" : "none";
  }

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

  // Estado inicial
  activate(0);
})();

// -----------------------
// Experiencia laboral dinámica (hasta 4) Página 2
// -----------------------
(function showEmpleoError(msg) {
  // helper to show/hide inline error for 'trabajaActualmente'
  // Declared as an IIFE that returns a callable function to avoid polluting global scope
})();
(function globalShowEmpleoError() {
  window.showEmpleoError = function (msg) {
    const sel = document.getElementById("trabajaActualmente");
    const err = document.getElementById("trabajaError");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
      sel?.classList?.add("invalid");
      sel?.setAttribute("aria-invalid", "true");
    } else {
      err.textContent = "";
      err.style.display = "none";
      sel?.classList?.remove("invalid");
      sel?.removeAttribute("aria-invalid");
    }
  };
})();
(function setupExperienciasLaborales() {
  const MAX_EXP = 4;
  const section = document.getElementById("experienciaLaboralSection");
  const container = document.getElementById("expContainer");
  const addBtn = document.getElementById("addExpBtn");
  if (!section || !container || !addBtn) return;
  const trabajaSel = document.getElementById("trabajaActualmente");

  function updateCurrentJobUI() {
    if (!trabajaSel) return;
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

  if (trabajaSel) {
    trabajaSel.addEventListener("change", () => {
      updateCurrentJobUI();
      updateAddBtn();
      // clear any previous inline error when user changes selection
      showEmpleoError(null);
      debouncedUpdate();
    });
    // clear error when user focuses the select
    trabajaSel.addEventListener("focus", () => showEmpleoError(null));
  }

  // Helper: focus + scroll + brief animation to draw atención al control
  function flashAndFocus(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      try { el.focus(); } catch (_) { }
    }
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) { }
    el.classList.add('attention');
    setTimeout(() => el.classList.remove('attention'), 900);
  }

  function createExpBlock(index) {
    const idPrefix = `exp-${index}`;
    const wrap = document.createElement("details");
    wrap.className = "exp-block";
    wrap.open = true;
    wrap.dataset.index = String(index);
    wrap.id = `${idPrefix}-block`;
    wrap.innerHTML = `
      <summary class="exp-header" style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
        <span class="chev" aria-hidden="true">▸</span>
        <strong id="${idPrefix}-title">Experiencia ${index + 1}</strong>
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
    return wrap;
  }

  function updateAddBtn() {
    const count = container.querySelectorAll(".exp-block").length;
    const selectionMissing = !(trabajaSel && (trabajaSel.value || "").trim());
    const sel = (trabajaSel?.value || "").toUpperCase();
    const maxAllowed = sel === "NO" ? 3 : MAX_EXP;
    addBtn.disabled = count >= maxAllowed || selectionMissing;
  }
  function addExp() {
    const count = container.querySelectorAll(".exp-block").length;
    if (!(trabajaSel && (trabajaSel.value || "").trim())) {
      showEmpleoError("Seleccione 'Sí' o 'No' para 'Empleo Actual' antes de añadir experiencias.");
      // Más visible: hacer focus, desplazar a la vista y animar brevemente el control
      flashAndFocus(trabajaSel);
      return;
    }
    const sel = (trabajaSel?.value || "").toUpperCase();
    const maxAllowed = sel === "NO" ? 3 : MAX_EXP;
    if (count >= maxAllowed) {
      showEmpleoError(`No puede agregar más de ${maxAllowed} experiencia(s) para la opción seleccionada.`);
      flashAndFocus(trabajaSel);
      return;
    }
    const block = createExpBlock(count);
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
      const currently = (trabajaSel?.value || "").toUpperCase() === "SI";
      if (title)
        title.textContent =
          i === 0 && currently ? "Experiencia actual" : `Experiencia ${i + 1}`;
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

  updateAddBtn();
  updateCurrentJobUI();
})();

// Extender collectFormValues para leer experiencias dinámicas
const _oldCollect2 = collectFormValues;
collectFormValues = function () {
  const v = _oldCollect2();
  // Reemplazar lectura estática de experiencias por dinámica SOLO si hay bloques dinámicos
  const trabaja = (
    document.getElementById("trabajaActualmente")?.value || ""
  ).toUpperCase();
  v.trabajaActualmente = trabaja === "SI";

  // Si hay bloques de experiencias dinámicas, usar esos; si no, mantener los estáticos
  const expContainer = document.getElementById("expContainer");
  if (expContainer && expContainer.querySelectorAll(".exp-block").length > 0) {
    v.experiencias = [];
    expContainer.querySelectorAll(".exp-block").forEach((block) => {
      v.experiencias.push({
        empresa: (block.querySelector(".empresa")?.value || "").toUpperCase(),
        tipoEmpresa: (
          block.querySelector(".tipoEmpresa")?.value || ""
        ).toUpperCase(),
        pais: (block.querySelector(".pais")?.value || "").toUpperCase(),
        depto: (block.querySelector(".depto")?.value || "").toUpperCase(),
        municipio: (
          block.querySelector(".municipio")?.value || ""
        ).toUpperCase(),
        correo: (block.querySelector(".correo")?.value || "").toLowerCase(),
        telefono: (block.querySelector(".telefono")?.value || "").toUpperCase(),
        fechaIngreso: block.querySelector(".fechaIngreso")?.value || "",
        fechaRetiro: block.querySelector(".fechaRetiro")?.value || "",
        cargo: (block.querySelector(".cargo")?.value || "").toUpperCase(),
        dependencia: (
          block.querySelector(".dependencia")?.value || ""
        ).toUpperCase(),
        direccion: (
          block.querySelector(".direccion")?.value || ""
        ).toUpperCase(),
      });
    });
  }
  return v;
};

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
// Botón "Ver PDF en nueva pestaña"
// -----------------------
(function setupOpenPdfTab() {
  const btn = document.getElementById("btn-open-pdf-tab");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      btn.textContent = "Generando...";
      const bytes = await buildPdfBytes();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      // Restaurar botón
      btn.textContent = "Ver PDF en nueva pestaña";
      btn.disabled = false;

      // Revocar URL después de un tiempo prudente
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error("Error abriendo PDF:", e);
      alert("Error generando el PDF. Revisa la consola.");
      btn.textContent = "Ver PDF en nueva pestaña";
      btn.disabled = false;
    }
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

// ==========================================
// SISTEMA DE PÁGINAS DINÁMICAS (PÁGINA 2.X)
// ==========================================

const setupTopTabs = {
  tabs: [],
  panels: [],

  init: function () {
    // Recolectar tabs y paneles basados en el estado actual
    this.tabs = [
      document.getElementById("tab-p1"),
      document.getElementById("tab-p2")
    ];
    this.panels = [
      document.getElementById("panel-p1"),
      document.getElementById("panel-p2")
    ];

    // Agregar tabs/paneles dinámicos de _page2State (saltando el primero que es main-p2)
    if (window._page2State && window._page2State.length > 1) {
      const dynamicPages = window._page2State.slice(1);
      dynamicPages.forEach(page => {
        const tab = document.getElementById(page.tabId);
        const panel = document.getElementById(page.panelId);
        if (tab && panel) {
          this.tabs.push(tab);
          this.panels.push(panel);
        }
      });
    }

    // Agregar P3 al final
    this.tabs.push(document.getElementById("tab-p3"));
    this.panels.push(document.getElementById("panel-p3"));

    // Limpiar listeners antiguos y asignar nuevos
    this.tabs.forEach((t, i) => {
      if (!t) return;
      // Clonar para limpiar listeners previos
      const newTab = t.cloneNode(true);
      t.replaceWith(newTab);
      this.tabs[i] = newTab;

      newTab.addEventListener("click", (e) => {
        e.preventDefault();
        setupTopTabs.activate(i);
      });
    });
  },

  activate: function (index) {
    // 1. Gestionar clases active/hidden
    this.tabs.forEach((t, i) => {
      if (!t) return;
      const selected = i === index;
      t.classList.toggle("active", selected);
      t.setAttribute("aria-selected", selected);
      if (this.panels[i]) this.panels[i].hidden = !selected;
    });

    // 2. Determinar qué página mostrar en el PDF/Canvas
    const activeTabId = this.tabs[index].id;
    let pdfPage = 1;
    let page2Idx = 0; // Índice dentro de _page2State

    if (activeTabId === "tab-p1") {
      pdfPage = 1;
    } else if (activeTabId === "tab-p3") {
      pdfPage = 3;
    } else {
      // Es alguna variante de Página 2
      pdfPage = 2;
      // Buscar índice en _page2State
      const stateIdx = window._page2State.findIndex(p => p.tabId === activeTabId);
      page2Idx = stateIdx >= 0 ? stateIdx : 0;
    }

    // 3. Actualizar vista previa
    // NOTA: goToPreviewPage debe ser actualizada para aceptar page2Idx si queremos preview específico
    // Por ahora, forzamos la actualización global
    _currentPreviewPage = pdfPage;
    // Guardamos el índice de P2 activo globalmente para que drawCanvasOverlay lo use
    window._activePage2Index = page2Idx;

    updateDesktopPreview();

    // 4. Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 5. Gestionar visibilidad botón descarga (solo en P3)
    const dlBtn = document.getElementById("downloadPdfBtn");
    if (dlBtn) dlBtn.style.display = (pdfPage === 3) ? "inline-block" : "none";
  }
};

// Función para agregar una nueva hoja Página 2
function addExtraPage2() {
  const count = window._page2State.length + 1; // Próximo número (visual)
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const panelId = `panel-p2-ext-${uniqueId}`;
  const tabId = `tab-p2-ext-${uniqueId}`;
  const containerId = `expContainer-ext-${uniqueId}`;
  const numLabel = `2.${window._page2State.length}`; // 2.1, 2.2 ...

  // 1. Crear nuevo estado
  const newPage = {
    id: uniqueId,
    type: "extra",
    label: `Página ${numLabel}`,
    containerId: containerId,
    panelId: panelId,
    tabId: tabId
  };
  window._page2State.push(newPage);

  // 2. Crear Tab en el DOM (insertar antes de P3)
  const tablist = document.querySelector(".tablist");
  const tabP3 = document.getElementById("tab-p3");

  const newTab = document.createElement("button");
  newTab.id = tabId;
  newTab.className = "tab";
  newTab.role = "tab";
  newTab.setAttribute("aria-selected", "false");
  newTab.setAttribute("aria-controls", panelId);
  newTab.innerText = `Página ${numLabel}`;

  tablist.insertBefore(newTab, tabP3);

  // 3. Crear Panel en el DOM
  const extrasContainer = document.getElementById("extraPagePanels");
  const newPanel = document.createElement("section");
  newPanel.id = panelId;
  newPanel.setAttribute("role", "tabpanel");
  newPanel.setAttribute("aria-labelledby", tabId);
  newPanel.hidden = true;

  // Estructura interna
  newPanel.innerHTML = `
    <div class="panel-placeholder">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h2>EXPERIENCIA LABORAL (ADICIONAL)</h2>
        <button type="button" class="btn-remove-page" onclick="removeExtraPage2('${uniqueId}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">
          🗑️ Eliminar Página
        </button>
      </div>
      <details class="section" open>
        <summary>Experiencia Laboral (Página ${numLabel})</summary>
        <div id="${containerId}" class="exp-container"></div>
        <button type="button" id="addExpBtn-${uniqueId}" class="add-exp">➕ Añadir experiencia</button>
        <p class="hint" style="font-size: 12px; color: #555; margin-top: 8px">
          Esta página permite agregar hasta 4 experiencias laborales adicionales.
        </p>
      </details>
    </div>
  `;
  extrasContainer.appendChild(newPanel);

  // 4. Inicializar lógica del botón "Añadir experiencia" para este panel
  const addExpBtn = document.getElementById(`addExpBtn-${uniqueId}`);
  const expContainer = document.getElementById(containerId);

  if (addExpBtn && expContainer) {
    // Definimos función inline para no depender de scope externo complejo
    const MAX_ITEMS = 4;
    const updateLocalBtn = () => {
      addExpBtn.disabled = expContainer.querySelectorAll(".exp-block").length >= MAX_ITEMS;
    };

    addExpBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const currentCount = expContainer.querySelectorAll(".exp-block").length;
      if (currentCount >= MAX_ITEMS) return;

      // Crear bloque simplificado
      const block = document.createElement("div"); // Usar div en vez de details si preferimos o mantener details
      block.className = "exp-block";
      // Estructura HTML idéntica a la principal para que CSS aplique
      block.innerHTML = `
          <div class="exp-header" style="display:flex; justify-content:space-between; margin-bottom:5px; background:#f9f9f9; padding:5px;">
             <strong>Experiencia ${currentCount + 1}</strong>
             <button type="button" class="remove-exp cancel-btn" style="border:none; background:transparent; color:red; cursor:pointer;">✕</button>
          </div>
          <div class="form-grid">
             <div><label>Empresa:</label><input type="text" class="empresa"></div>
             <div><label>Tipo:</label><select class="tipoEmpresa"><option value="">Seleccionar...</option><option value="PUBLICA">Pública</option><option value="PRIVADA">Privada</option></select></div>
             <div><label>Cargo:</label><input type="text" class="cargo"></div>
             <div><label>Fecha Ingreso:</label><input type="date" class="fechaIngreso"></div>
             <div><label>Fecha Retiro:</label><input type="date" class="fechaRetiro"></div>
             <div><label>País:</label><input type="text" class="pais"></div>
             <div><label>Depto:</label><input type="text" class="depto"></div>
             <div><label>Municipio:</label><input type="text" class="municipio"></div>
             <div><label>Correo:</label><input type="email" class="correo"></div>
             <div><label>Teléfono:</label><input type="text" class="telefono"></div>
             <div><label>Dependencia:</label><input type="text" class="dependencia"></div>
             <div><label>Dirección:</label><input type="text" class="direccion"></div>
          </div>
        `;

      // Listener eliminar
      block.querySelector(".remove-exp").addEventListener("click", () => {
        block.remove();
        updateLocalBtn();
        // Reindexar visualmente
        expContainer.querySelectorAll(".exp-block").forEach((b, i) => {
          b.querySelector("strong").textContent = `Experiencia ${i + 1}`;
        });
        debouncedUpdate();
      });

      // Listeners updates
      block.querySelectorAll("input, select").forEach(inp => {
        inp.addEventListener("input", debouncedUpdate);
      });

      expContainer.appendChild(block);
      updateLocalBtn();
      debouncedUpdate();
    });
  }

  // 5. Reinicializar tabs y activar la nueva
  setupTopTabs.init();
  // El índice de la nueva tab es justo antes de P3. 
  // setupTopTabs.tabs tiene [P1, P2(main), P2.1, ... P3]
  // Queremos activar la penúltimo (Length - 2)
  const newIndex = setupTopTabs.tabs.length - 2;
  setupTopTabs.activate(newIndex);
}

// Función para eliminar una hoja extra (debe ser global para el onclick)
window.removeExtraPage2 = function (uniqueId) {
  if (!confirm("¿Seguro que deseas eliminar esta página y todo su contenido?")) return;

  // 1. Eliminar del DOM
  const pageState = window._page2State.find(p => p.id === uniqueId);
  if (pageState) {
    const tab = document.getElementById(pageState.tabId);
    const panel = document.getElementById(pageState.panelId);
    if (tab) tab.remove();
    if (panel) panel.remove();
  }

  // 2. Eliminar del estado
  window._page2State = window._page2State.filter(p => p.id !== uniqueId);

  // 3. Renombrar pestañas restantes
  // (Opcional, pero para mantener orden visual 2.1, 2.2 si se borró la 2.1)
  let extraCount = 1;
  window._page2State.forEach((p, idx) => {
    if (idx === 0) return; // Skip main
    const newNum = `2.${extraCount++}`;
    const tab = document.getElementById(p.tabId);
    const panel = document.getElementById(p.panelId);

    if (tab) tab.innerText = `Página ${newNum}`;
    if (panel) {
      const summary = panel.querySelector("summary");
      if (summary) summary.innerText = `Experiencia Laboral (Página ${newNum})`;
    }
    p.label = `Página ${newNum}`;
  });

  // 4. Reinicializar tabs y volver a P2 principal
  setupTopTabs.init();
  setupTopTabs.activate(1); // Ir a main P2
  debouncedUpdate();
};

// Inicializar al carga
window.addEventListener("load", () => {
  setupTopTabs.init();

  // Bind botón agregar (asegurar que exista)
  const addPageBtn = document.getElementById("addExtraPageBtn");
  if (addPageBtn) {
    addPageBtn.onclick = (e) => {
      e.preventDefault();
      addExtraPage2();
    };
  }
});

// Helper global para inicializar lógica de experiencias dinámicas
window.setupDynamicExpLogic = function (container, btn, isExtra) {
  const MAX_ITEMS = 4;
  const updateBtnState = () => {
    const count = container.querySelectorAll(".exp-block").length;
    btn.disabled = count >= MAX_ITEMS;
  };

  btn.onclick = (e) => {
    e.preventDefault();
    const count = container.querySelectorAll(".exp-block").length;
    if (count >= MAX_ITEMS) return;

    const idx = count;

    const block = document.createElement("div");
    block.className = "exp-block";
    block.innerHTML = `
          <div class="exp-header" style="display:flex; justify-content:space-between; margin-bottom:5px; background:#f9f9f9; padding:5px;">
             <strong>Experiencia ${idx + 1}</strong>
             <button type="button" class="remove-exp cancel-btn" style="border:none; background:transparent; color:red; cursor:pointer;">✕</button>
          </div>
          <div class="form-grid">
             <div><label>Empresa:</label><input type="text" class="empresa"></div>
             <div><label>Tipo:</label><select class="tipoEmpresa"><option value="">Seleccionar...</option><option value="PUBLICA">Pública</option><option value="PRIVADA">Privada</option></select></div>
             <div><label>Cargo:</label><input type="text" class="cargo"></div>
             <div><label>Fecha Ingreso:</label><input type="date" class="fechaIngreso"></div>
             <div><label>Fecha Retiro:</label><input type="date" class="fechaRetiro"></div>
             <div><label>País:</label><input type="text" class="pais"></div>
             <div><label>Depto:</label><input type="text" class="depto"></div>
             <div><label>Municipio:</label><input type="text" class="municipio"></div>
             <div><label>Correo:</label><input type="email" class="correo"></div>
             <div><label>Teléfono:</label><input type="text" class="telefono"></div>
             <div><label>Dependencia:</label><input type="text" class="dependencia"></div>
             <div><label>Dirección:</label><input type="text" class="direccion"></div>
          </div>
        `;

    block.querySelector(".remove-exp").addEventListener("click", () => {
      block.remove();
      updateBtnState();
      // Reindexar visualmente
      container.querySelectorAll(".exp-block").forEach((b, i) => {
        b.querySelector("strong").textContent = `Experiencia ${i + 1}`;
      });
      debouncedUpdate();
    });

    // Listeners updates
    block.querySelectorAll("input, select").forEach(inp => {
      inp.addEventListener("input", debouncedUpdate);
    });

    container.appendChild(block);
    updateBtnState();
    debouncedUpdate();
  };

  // Inicializar estado del botón
  updateBtnState();
};


// Fix for URL clutter: Prevent default form submission
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formulario");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      // Optional: Trigger preview update if that's a global function
      if (typeof debouncedUpdate === 'function') {
        debouncedUpdate();
      }
    });
  }
});
