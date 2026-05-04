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

app.listen(PORT, () => {
  console.log(`\nServidor backend corriendo en http://localhost:${PORT}`);
});

module.exports = app;