/*archivo q usare para aplicar logica JavaScript a la web*/

const CONFIG = {
  API_BASE : 'http://localhost:3000/api',
  TIMEOUT  : 8000,
  SEARCH_DELAY: 400
};

//Estado de la aplicación
const state = { tramites: [], searching: false };

//Utilidades DOM
const $ = id => document.getElementById(id);
const DOM = {
  asignarTexto : (id, txt)  => { const e=$( id); if(e) e.textContent = txt; },
  asignarHTML : (id, html) => { const e=$( id); if(e) e.innerHTML   = html; },
  mostrar    : el => el?.classList.remove('d-none'),
  ocultar    : el => el?.classList.add('d-none'),
};

//Validacion de formularios
const Validador = {
  //Valida un campo y aplica clases Bootstrap is-valid / is-invalid
  campo(el) {
    el.classList.remove('is-valid', 'is-invalid');
    const ok = el.value.trim() === '' && !el.required
      ? true
      : el.checkValidity();
    el.classList.add(ok ? 'is-valid' : 'is-invalid');
    return ok;
  },

  //Valida todos los campos de un formulario
  formulario(formId) {
    const form = $(formId);
    if (!form) return false;
    form.classList.add('was-validated');
    let valid = true;
    form.querySelectorAll('input,select,textarea').forEach(el => {
      if (!this.campo(el)) valid = false;
    });
    return valid;
  },

  //Resetea el formulario
  reiniciar(formId) {
    const form = $(formId);
    if (!form) return;
    form.reset();
    form.classList.remove('was-validated');
    form.querySelectorAll('.is-valid,.is-invalid').forEach(el =>
      el.classList.remove('is-valid','is-invalid')
    );
  }
};

//Servicio de API
const API = {
  async obtener(path) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT);
    try {
      const res = await fetch(CONFIG.API_BASE + path, {
        signal: ctrl.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    } catch(e) { clearTimeout(tid); throw e; }
  },

  async enviar(path, data) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT);
    try {
      const res = await fetch(CONFIG.API_BASE + path, {
        method : 'POST',
        signal : ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(data)
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    } catch(e) { clearTimeout(tid); throw e; }
  }
};

//Funciones de interfaz (UI)
function escaparHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function botonCargando(id, loading, label) {
  const b = $(id); if(!b) return;
  b.disabled = loading;
  b.innerHTML = loading
    ? '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Consultando...'
    : label;
}

function mostrarAlerta(containerId, msg, type='success') {
  const icons = { success:'✓', danger:'✗', info:'ℹ', warning:'⚠' };
  DOM.asignarHTML(containerId, `
    <div class="alert alert-${type} alert-dismissible d-flex gap-2 align-items-center" role="alert">
      <span aria-hidden="true">${icons[type]??'•'}</span>
      <div>${msg}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    </div>`);
}

function mostrarCajaApi(data, isErr=false) {
  const el = $('api-results'); if(!el) return;
  const json = JSON.stringify(data, null, 2)
    .replace(/(".*?")/g, '<span style="color:#a6e3a1">$1</span>')
    .replace(/: (true|false|\d+)/g, ': <span style="color:#fab387">$1</span>');
  el.innerHTML = json;
  DOM.asignarHTML('api-status',
    `<span class="${isErr?'status-error':'status-ok'}">${isErr?'● ERROR':'● 200 OK'}</span>`);
}

function mostrarTramites(list) {
  const tbody = $('tramites-tbody'); if(!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Sin trámites disponibles.</td></tr>';
    return;
  }
  const badge = s => ({
    'Disponible' : '<span class="badge bg-success">Disponible</span>',
    'En proceso'  : '<span class="badge bg-warning text-dark">En proceso</span>',
    'Suspendido'  : '<span class="badge bg-danger">Suspendido</span>'
  }[s] ?? `<span class="badge bg-secondary">${escaparHtml(s)}</span>`);

  tbody.innerHTML = list.map(t => `
    <tr>
      <td class="fw-semibold">${escaparHtml(t.nombre)}</td>
      <td><small>${escaparHtml(t.institucion)}</small></td>
      <td><small>${escaparHtml(t.tiempo)}</small></td>
      <td>${badge(t.estado)}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary"
                onclick="iniciarTramite('${escaparHtml(t.id)}')"
                aria-label="Iniciar trámite ${escaparHtml(t.nombre)}">
          Iniciar
        </button>
      </td>
    </tr>`).join('');
}

function mostrarBusqueda(items) {
  if (!items.length) {
    DOM.asignarHTML('search-results', '<p class="text-muted small text-center">Sin resultados.</p>');
    return;
  }
  DOM.asignarHTML('search-results', `
    <ul class="list-group shadow-sm">
      ${items.map(r=>`
        <li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
          <span>${escaparHtml(r.nombre)}</span>
          <span class="badge bg-primary">${escaparHtml(r.tipo)}</span>
        </li>`).join('')}
    </ul>`);
}

//Formulario consulta trámite
$('tramite-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!Validador.formulario('tramite-form')) return;

  const body = {
    tipo       : $('tipo-tramite').value,
    expediente : $('expediente-input').value.trim(),
    dni        : $('dni-input').value.trim(),
    email      : $('email-input').value.trim() || null
  };

  botonCargando('btn-consultar', true, 'Consultar Estado del Trámite');

  try {
    const data = await API.enviar('/tramites/consultar', body);
    mostrarCajaApi(data, false);
  } catch {
    //Respuesta simulada cuando servidor no está disponible
    mostrarCajaApi({
      status      : 'success',
      expediente  : body.expediente,
      tipo        : body.tipo,
      estado      : 'En proceso',
      descripcion : 'Trámite siendo procesado. Tiempo estimado: 3-5 días hábiles.',
      fecha_consulta: new Date().toISOString(),
      nota        : '[Demo] Servidor offline – respuesta simulada'
    }, false);
  } finally {
    botonCargando('btn-consultar', false, 'Consultar Estado del Trámite');
  }
});

//Buscador
let searchTimer;
$('buscador-input')?.addEventListener('input', function() {
  clearTimeout(searchTimer);
  const q = this.value.trim();
  if (q.length < 2) { DOM.asignarHTML('search-results',''); return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await API.obtener(`/buscar?q=${encodeURIComponent(q)}`);
      mostrarBusqueda(data.results ?? []);
    } catch {
      mostrarBusqueda([
        { id:1, nombre:`${q} – orientación ciudadana`, tipo:'Servicio' },
        { id:2, nombre:`${q} – trámite en línea`,      tipo:'Trámite' }
      ]);
    }
  }, CONFIG.SEARCH_DELAY);
});

$('btn-buscar')?.addEventListener('click', () =>
  $('buscador-input').dispatchEvent(new Event('input'))
);

//Formulario reporte
$('reporte-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!Validador.formulario('reporte-form')) return;

  const btn = $('btn-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const body = {
    nombre      : $('rep-nombre').value.trim(),
    email       : $('rep-email').value.trim(),
    tipo        : $('rep-tipo').value,
    descripcion : $('rep-descripcion').value.trim()
  };

  try {
    await API.enviar('/reportes', body);
    mostrarAlerta('reporte-msg', 'Reporte enviado. Te contactaremos en 24-48 horas hábiles.', 'success');
  } catch {
    mostrarAlerta('reporte-msg', 'Reporte registrado. (Demo – servidor sin conexión)', 'info');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar Reporte';
    Validador.reiniciar('reporte-form');
  }
});

//Contador de caracteres
$('rep-descripcion')?.addEventListener('input', function() {
  DOM.asignarTexto('rep-chars', `${this.value.length} / 500`);
});

//Validación en tiempo real al salir del campo
document.querySelectorAll('#tramite-form input, #tramite-form select, #reporte-form input, #reporte-form select, #reporte-form textarea')
  .forEach(el => el.addEventListener('blur', () => Validador.campo(el)));

//Iniciar trámite desde la tabla
function iniciarTramite(id) {
  const t = state.tramites.find(x => x.id === id);
  if (!t) return;
  $('api-consulta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const map = { T001:'dni', T002:'licencia', T003:'partida', T004:'ruc', T005:'pasaporte' };
  const sel = $('tipo-tramite');
  if (sel && map[id]) { sel.value = map[id]; Validador.campo(sel); }
}

// Cargar-actualizar trámites 
async function cargarTramites() {
  try {
    const data = await API.obtener('/tramites');
    state.tramites = data.tramites ?? [];
  } catch {
    state.tramites = [
      { id:'T001', nombre:'Renovación de DNI',       institucion:'RENIEC',      tiempo:'15 días hábiles', estado:'Disponible'  },
      { id:'T002', nombre:'Licencia de Conducir',    institucion:'MTC',         tiempo:'10 días hábiles', estado:'Disponible'  },
      { id:'T003', nombre:'Partida de Nacimiento',   institucion:'RENIEC',      tiempo:'3 días hábiles',  estado:'Disponible'  },
      { id:'T004', nombre:'Consulta RUC',            institucion:'SUNAT',       tiempo:'Inmediato',       estado:'Disponible'  },
      { id:'T005', nombre:'Pasaporte',               institucion:'MIGRACIONES', tiempo:'20 días hábiles', estado:'En proceso'  }
    ];
  }
  mostrarTramites(state.tramites);
}

$('btn-actualizar')?.addEventListener('click', cargarTramites);

// inicio
document.addEventListener('DOMContentLoaded', cargarTramites);