//archivo q usare para ejecutar backend y logica de la app
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

//cabeceras de seguridad http
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'"],
      styleSrc   : ["'self'", "'unsafe-inline'"],
      imgSrc     : ["'self'", 'data:'],
      connectSrc : ["'self'"]
    }
  }
}));

//cors de seguridad
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin     : ALLOWED_ORIGIN,
  methods    : ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

//rango de consultas maximas para controlar consumo y ataques por ip
const limiterGeneral = rateLimit({
  windowMs       : 15 * 60 * 1000,   
  max            : 100,
  standardHeaders: true,
  legacyHeaders  : false,
  message        : { status:'error', error:'Demasiadas solicitudes. Intenta en 15 minutos.' }
});
app.use('/api/', limiterGeneral);

//limite para consultas especificas
const limiterConsulta = rateLimit({
  windowMs: 60 * 1000,
  max     : 10,
  message : { status:'error', error:'Límite de consultas excedido. Espera 1 minuto.' }
});

//cuerpo limite de tamaño de los pedidos
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

//middleware para loguear peticiones
app.use((req, _res, next) => {
  const ts  = new Date().toISOString();
  const ip  = (req.ip || '').replace(/\d{1,3}$/, 'xxx');   
  console.log(`[${ts}] ${req.method} ${req.path} — IP:${ip}`);
  next();
});

//funciones de seguridad
const sanitize = str =>
  typeof str !== 'string' ? '' :
  str.trim().replace(/[<>"'`]/g, '').substring(0, 500);

//validaciones
const isValidDNI         = v => /^\d{8}$/.test(v);
const isValidExpediente  = v => /^EXP-\d{4}-\d{6}$/.test(v);
const isValidEmail       = v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const maskDNI            = d => d.replace(/\d{4}$/, 'XXXX');   
const maskEmail          = e => e ? e.replace(/(?<=.{2}).(?=.*@)/g, '*') : null;

const TRAMITES = [
  { id:'T001', nombre:'Renovación de DNI',       institucion:'RENIEC',      tiempo:'15 días hábiles', estado:'Disponible', url:'https://gob.pe/reniec'      },
  { id:'T002', nombre:'Licencia de Conducir',    institucion:'MTC',         tiempo:'10 días hábiles', estado:'Disponible', url:'https://gob.pe/mtc'         },
  { id:'T003', nombre:'Partida de Nacimiento',   institucion:'RENIEC',      tiempo:'3 días hábiles',  estado:'Disponible', url:'https://gob.pe/reniec'      },
  { id:'T004', nombre:'Consulta RUC',            institucion:'SUNAT',       tiempo:'Inmediato',       estado:'Disponible', url:'https://gob.pe/sunat'       },
  { id:'T005', nombre:'Pasaporte',               institucion:'MIGRACIONES', tiempo:'20 días hábiles', estado:'En proceso', url:'https://gob.pe/migraciones' }
];

//verificación del estado del servidor
app.get('/api/health', (_req, res) => {
  res.json({ status:'OK', timestamp: new Date().toISOString(), version:'1.0.0' });
});

//listar todos los trámites
app.get('/api/tramites', (req, res) => {
  let result = [...TRAMITES];

  if (req.query.estado) {
    const q = sanitize(req.query.estado).toLowerCase();
    result   = result.filter(t => t.estado.toLowerCase() === q);
  }
  if (req.query.institucion) {
    const q = sanitize(req.query.institucion).toLowerCase();
    result   = result.filter(t => t.institucion.toLowerCase().includes(q));
  }

  res.json({ status:'success', total: result.length, tramites: result });
});

//obtener trámite específico por ID
app.get('/api/tramites/:id', (req, res) => {
  const id     = sanitize(req.params.id);
  const tramite = TRAMITES.find(t => t.id === id);

  if (!tramite) return res.status(404).json({ status:'error', error:'Trámite no encontrado.' });
  res.json({ status:'success', tramite });
});

//busca de tramites por texto
app.get('/api/buscar', (req, res) => {
  const q = sanitize(req.query.q || '');
  if (q.length < 2) {
    return res.status(400).json({ status:'error', error:'La búsqueda debe tener al menos 2 caracteres.' });
  }

  const results = TRAMITES
    .filter(t =>
      t.nombre.toLowerCase().includes(q.toLowerCase()) ||
      t.institucion.toLowerCase().includes(q.toLowerCase())
    )
    .map(({ id, nombre, institucion }) => ({ id, nombre, tipo:'Trámite', institucion }));

  res.json({ status:'success', query: q, results });
});

//consulta de estado de trámites
app.post('/api/tramites/consultar', limiterConsulta, (req, res) => {
  const { tipo, expediente, dni, email } = req.body;

  const errors = [];
  if (!sanitize(tipo))                   errors.push('El tipo de trámite es requerido.');
  if (!isValidExpediente(expediente))    errors.push('Formato de expediente inválido. Use: EXP-AAAA-XXXXXX');
  if (!isValidDNI(dni))                  errors.push('El DNI debe contener exactamente 8 dígitos.');
  if (!isValidEmail(email))              errors.push('Formato de correo electrónico inválido.');

  if (errors.length) return res.status(400).json({ status:'error', errors });

  // Simulación de consulta a servicio externo
  const posibles = ['En proceso', 'Aprobado', 'Pendiente documentación', 'En revisión'];
  const estado   = posibles[Math.floor(Math.random() * posibles.length)];
  const fechaEst = new Date(Date.now() + 15 * 24 * 3600 * 1000).toLocaleDateString('es-PE');

  // Protección de datos: enmascarar información sensible en la respuesta
  res.json({
    status        : 'success',
    expediente    : sanitize(expediente),
    tipo          : sanitize(tipo),
    dni           : maskDNI(dni),           
    email         : maskEmail(email),       
    estado,
    descripcion   : `Tu trámite está actualmente "${estado}".`,
    fecha_consulta: new Date().toISOString(),
    fecha_estimada: fechaEst
  });
});

//recibir reporte de problemas
app.post('/api/reportes', (req, res) => {
  const { nombre, email, tipo, descripcion } = req.body;

  const nombreClean = sanitize(nombre);
  const descClean   = sanitize(descripcion);

  // Validaciones
  const errors = [];
  if (nombreClean.length < 3)   errors.push('El nombre debe tener al menos 3 caracteres.');
  if (!isValidEmail(email))      errors.push('Correo electrónico inválido.');
  if (!sanitize(tipo))           errors.push('El tipo de problema es requerido.');
  if (descClean.length < 20)    errors.push('La descripción debe tener al menos 20 caracteres.');

  if (errors.length) return res.status(400).json({ status:'error', errors });

  // Generar número de ticket único
  const ticket = 'TKT-' + Date.now().toString(36).toUpperCase();

  // Log interno sin datos sensibles completos
  console.log(`[REPORTE] ticket=${ticket} tipo=${tipo} email=${maskEmail(email)}`);

  // En producción: guardar en BD y enviar email de confirmación
  res.status(201).json({
    status         : 'success',
    mensaje        : 'Reporte registrado correctamente.',
    ticket,
    tiempo_respuesta: '24-48 horas hábiles'
  });
});

//404 — Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ status:'error', error:'Ruta no encontrada.', path: req.path });
});

//500 — Error interno del servidor 
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ status:'error', error:'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`\nServidor backend corriendo en http://localhost:${PORT}`);
  console.log('Rutas disponibles:');
  console.log('GET  /api/health');
  console.log('GET  /api/tramites');
  console.log('GET  /api/tramites/:id');
  console.log('POST /api/tramites/consultar');
  console.log('POST /api/reportes\n');
});

module.exports = app;