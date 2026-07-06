# MAVA Taller

App de gestión para taller mecánico (diagnósticos, certificados de service, cotizador de auxilio a domicilio, ficha de filtros por motor). React + Vite + Supabase.

## Primer uso en esta carpeta

Esta carpeta llega **sin `node_modules`** a propósito (pesa demasiado para mandarla comprimida). Antes de correr nada:

```
npm install
```

Después, para desarrollo local:

```
npm run dev
```

Y para generar la versión de producción (la que se sube a Netlify):

```
npm run build
```

## Estructura

```
app-taller/
├── index.html          <- punto de entrada, con el manifest de la PWA ya enlazado
├── public/
│   ├── manifest.json    <- configuracion de la app instalable
│   ├── sw.js             <- service worker (cache basico offline)
│   ├── favicon.svg
│   └── icons/            <- iconos de la PWA en distintos tamanos
├── src/
│   ├── App.jsx           <- toda la logica de la app
│   ├── App.css           <- estilos
│   ├── main.jsx          <- arranque de React + registro del service worker
│   ├── index.css
│   └── supabase.js       <- conexion a Supabase (usa la clave publica, es seguro tenerla en el codigo)
├── package.json
└── vite.config.js
```

## Importante - seguridad

- `src/supabase.js` usa la **clave publica** (`sb_publishable_...`) de Supabase. Es seguro que este en el codigo y se suba a GitHub, siempre que tengas Row Level Security (RLS) activado en tus tablas (ya lo configuramos).
- **Nunca** pongas la **clave secreta** (`sb_secret_...`) en ningun archivo de este proyecto. Esa clave no la necesita esta app para nada.

## Deploy en Netlify

- Build command: `npm run build`
- Publish directory: `dist`

No hace falta configurar variables de entorno para este proyecto (no usa ninguna).
