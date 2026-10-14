# DIANDRA — RH multiempresa (fase 1) — Diseño

Fecha: 2026-10-13 · Estado: aprobado en chat, pendiente revisión del spec escrito

## 1. Contexto y objetivo

**Clienta:** Diana Andrade, contadora y licenciada en derecho, independizándose. Dará servicios contables a varias empresas y llevará el RH de los empleados de esas empresas.

**Objetivo fase 1:** copia del sistema RHATA (`~/rhata`) convertida a **multiempresa**: Diana da de alta empresas cliente y gestiona expedientes, documentos, pagos, checador, salidas, cultura y contratos de los empleados de cada una, sin que se crucen datos entre empresas.

**Lo que dijo el usuario:**
- Copia del módulo RHATA, todos los módulos.
- RH es para los empleados de los **clientes** de Diana.
- Solo entran Diana y su equipo (no hay portal de clientes).
- Solo web. Mismo servidor Hetzner (62.238.3.136).
- Marca "DIANDRA", admin `admin@diandra.com`.

**Supuestos:**
- `admin@diandra.com` es provisional; no hay dominio.
- Sin logo hasta que Diana entregue uno.
- Arranca con BD vacía (no se migran datos de RHATA).

**Criterio de éxito:** Diana da de alta una empresa, le carga empleados con expediente, documentos, pagos y salidas, genera un contrato con los datos del patrón ya llenos, cambia de empresa con un selector, y ninguna petición —ni con ids editados a mano— devuelve datos o archivos de otra empresa.

**Fuera de alcance (fase 1):**
- Fase 2: control de clientes / servicios contables (spec propio).
- Portal o usuarios por empresa cliente.
- Permisos usuario↔empresa (todo usuario del despacho ve todas las empresas).
- Envío de contratos por SMTP.
- Repo GitHub + deploy key, dominio + HTTPS, logo, respaldo de `uploads/`.

## 2. Enfoque elegido

Una sola app con tabla `empresas` y `empresa_id` en las tablas raíz (opción A). Descartadas: una instancia de RHATA por cliente (B, inmanejable operativamente) y un esquema Postgres por empresa (C, complejidad sin beneficio para un despacho de un solo equipo).

## 3. Modelo de datos

Migración nueva `013_multiempresa.sql` sobre las 12 de RHATA (se conserva la numeración para poder portar parches).

### Tabla `empresas`
| Columna | Tipo | Notas |
|---|---|---|
| id | SERIAL PK | |
| razon_social | VARCHAR(200) NOT NULL | |
| nombre_comercial | VARCHAR(200) | |
| rfc | VARCHAR(13) NOT NULL UNIQUE | 12 (moral) o 13 (física) |
| registro_patronal | VARCHAR(20) | IMSS |
| representante_legal | VARCHAR(200) | → `nombre_patron` del contrato |
| domicilio | VARCHAR(300) | → `direccion_empresa` |
| colonia | VARCHAR(150) | → `colonia_empresa` |
| cp | VARCHAR(10) | → `cp_empresa` |
| ciudad | VARCHAR(100) | → `ciudad` |
| giro | VARCHAR(200) | → `giro_empresa` |
| activo | BOOLEAN NOT NULL DEFAULT true | baja lógica, nunca DELETE |
| created_at | TIMESTAMPTZ DEFAULT now() | |

### `empresa_id INTEGER NOT NULL REFERENCES empresas(id)` en tablas raíz
| Tabla | Cambio |
|---|---|
| empleados | + `empresa_id`; `curp` y `rfc` de UNIQUE global → `UNIQUE(empresa_id, curp)`, `UNIQUE(empresa_id, rfc)` |
| semanas_pago | + `empresa_id`; `UNIQUE(semana, anio)` → `UNIQUE(empresa_id, semana, anio)` |
| checador_dispositivos | + `empresa_id` |
| salidas | columna existente → `NOT NULL` + FK |
| cultura_empresa | columna existente → FK (ya es NOT NULL) |

Índice en cada `empresa_id` nuevo.

### Tablas que heredan empresa por su padre (sin columna)
- `documentos`, `checador_empleados`, `checadas` → `empleados`
- `pagos` → `semanas_pago` (su `empleado_id` puede ser NULL)
- `documentos_salida` → `salidas`

### Compartidas por el despacho
`usuarios`, `tipos_documento` (incluye formatos descargables), `_migrations`.

### Rutas de archivos relativas
La BD guarda rutas **relativas a `uploads/`** (p. ej. `formatos/formato_10.pdf`), nunca absolutas. Lectura y borrado resuelven con `path.join(UPLOADS_DIR, ruta)`. Motivo: en RHATA las rutas absolutas `/root/rhata/...` dejaron todos los archivos inaccesibles al mover la app a `/home/apps` (2026-10-13). Afecta: `documentos.ruta`, `tipos_documento.formato_ruta`, `semanas_pago.ruta`, `documentos_salida.documento_url`, `empleados.foto`, `cultura_empresa.archivos`.

## 4. Aislamiento en backend

### Empresa activa
- Frontend envía header `X-Empresa-Id` en cada petición.
- Middleware nuevo `middleware/empresa.js`, montado después de `auth`:
  - Header ausente o no numérico → 400.
  - Empresa inexistente o `activo = false` → 404.
  - OK → `req.empresaId`.
- Exentas: `/api/auth`, `/api/empresas`, `/api/documentos/tipos`, `/api/formatos` (catálogo compartido), `/api/checadas` (usa api_key, ver abajo).
- No va en el JWT: cambiar de empresa no exige re-login.

### Modelos
- Cada método recibe `empresaId` como primer parámetro: `findAll(empresaId, filters)`, `findById(empresaId, id)`, `create(empresaId, data)`, `update(empresaId, id, data)`, `delete(empresaId, id)`.
- Tablas raíz: `WHERE empresa_id = $1 AND id = $2`; `INSERT` fija `empresa_id` desde `req.empresaId` (nunca desde el body).
- Tablas hijas: JOIN al padre, p. ej. `FROM documentos d JOIN empleados e ON e.id = d.empleado_id WHERE e.empresa_id = $1 AND d.id = $2`.
- Al crear un hijo (documento, salida, mapeo checador), se valida que el padre (`empleado_id`) sea de `req.empresaId`.
- Id existente de otra empresa → **404** (no 403).
- Descargas y borrados de archivo pasan por el `findById` con empresa.

### Validación cruzada
- Checador: mapeo UID→empleado solo acepta empleados con `empresa_id` igual al del dispositivo.
- Pagos: el match de empleados al importar el PDF solo busca empleados de la empresa de la semana.

### Checador (sin usuario)
Autentica por `api_key` del dispositivo; la empresa sale de `checador_dispositivos.empresa_id`. No usa `X-Empresa-Id`.

### Endpoints nuevos
- `GET /api/empresas` (todas, incluye inactivas con flag), `GET /api/empresas/:id`, `POST /api/empresas`, `PUT /api/empresas/:id`, `PATCH /api/empresas/:id/activo`. Mutaciones: roles admin y rh.
- RFC validado en backend: `^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$`.
- `POST /api/contratos/:empleadoId`: arma los datos del trabajador desde `empleados` y los del patrón desde `empresas`, acepta overrides en el body, renderiza la plantilla `.docx` existente de `~/contratos` (docxtemplater/pizzip, mismas dependencias) y responde el archivo para descarga.

## 5. Interfaz

- **Selector de empresa** (`<select>` nativo) en la navbar junto al usuario. Empresa activa en `localStorage` (`empresaActiva`); `api/client.js` la agrega como `X-Empresa-Id` en el interceptor existente.
  - Al cambiar: navegar a `/` y recargar datos.
  - Si la API responde 404 por empresa inactiva/inexistente: limpiar `localStorage` y pedir elegir otra.
- **Nombre de la empresa activa** visible en el header de cada página.
- **Primer uso:** sin empresas → redirige a `/empresas/nueva` ("Da de alta tu primer cliente"); el resto del menú deshabilitado hasta tener empresa activa.
- **Página `Empresas`** (`/empresas`, `/empresas/nueva`, `/empresas/:id/editar`): tabla (razón social, RFC, empleados activos, estado) + formulario con los campos de la sección 3. Botón "Desactivar/Activar", sin borrar.
- **Cambios en pantallas existentes:**
  - `EmpleadoDetallePage`: eliminar `EMPRESA_ID = 1` y `CONTRATOS_URL`.
  - `GeneradorContratoModal`: llama a `/api/contratos/:empleadoId`; campos del patrón precargados desde la empresa y editables.
  - `CulturePage`: eliminar `empresa_id` hardcodeado.
- **Marca:** "DIANDRA" en navbar, login y `<title>`; quitar logo y textos "Grupo ATA"/"ATA" (UI, logs, agente-checador, plantilla de email).

## 6. Proyecto, deploy e infraestructura

| | |
|---|---|
| Carpeta local | `~/diandra/` |
| Carpeta servidor | `/home/apps/diandra/` (owner `apps`) |
| Backend | PM2 `diandra-backend`, puerto **3015** |
| Postgres | Docker `diandra-postgres-1`, `127.0.0.1:5445`, db `diandra`, user `diandra_user` |
| Nginx | `/etc/nginx/sites-enabled/diandra`, `listen 8098` (sin `default_server`), mismo bloque que RHATA (`client_max_body_size 25M`, proxy `/api` y `/uploads` a 3015, `X-Forwarded-For`) |
| Firewall | `ufw allow 8098/tcp` |
| URL | http://62.238.3.136:8098 |

- Copia de RHATA excluyendo `.git`, `node_modules`, `uploads`, `dist`, `.env`. Repo git nuevo; antes del primer commit, `grep` de secretos (passwords, `JWT_SECRET`, IPs con credenciales) en todo el árbol.
- Se conservan del endurecimiento de RHATA: rate limit en `/api/auth`, `trust proxy`, `/uploads` estático solo imágenes, CORS (`CORS_ORIGIN=http://62.238.3.136:8098`), errorHandler sin detalle interno, validación de mimetype.
- Secretos: DB password y `JWT_SECRET` con `openssl rand -hex 24` en el servidor, solo en `/home/apps/diandra/backend/.env`. El `.env` se crea solo si no existe. `credentials.md` solo guarda el usuario admin.
- Admin inicial `admin@diandra.com`, contraseña aleatoria fuerte (`openssl rand`); se entrega al usuario y se guarda en `credentials.md`, no se versiona. Forzar cambio de contraseña en primer login queda fuera (RHATA no lo tiene).
- `deploy.sh`: copia del de RHATA (`--exclude uploads/`, `--chown=apps:apps`, `sudo -u apps`) con rutas/nombres de DIANDRA. Se valida end-to-end en el primer deploy.
- Respaldo BD: automático (`backup-databases.sh` toma todo contenedor con "postgres").

## 7. Pruebas

- **Test de aislamiento** (`node --test`, BD de prueba en Docker local): crea empresas A y B, cada una con empleado, documento, semana de pago, salida, dispositivo checador y elemento de cultura. Con `X-Empresa-Id: A`:
  - listados devuelven solo registros de A;
  - GET, descarga, PUT y DELETE de cada id de B → 404;
  - POST de documento/salida/mapeo sobre `empleado_id` de B → 404;
  - POST con `empresa_id: B` en el body crea en A (se ignora el body).
  - Sin header → 400; header de empresa inactiva → 404.
- **Checador:** dispositivo de A no puede mapear ni registrar checadas de empleado de B.
- **Rutas relativas:** subir archivo guarda ruta relativa y se descarga correctamente.
- **Humo en producción tras deploy:** login, alta de empresa, alta de empleado, subir y descargar documento, generar contrato.

## 8. Pendientes fuera de este spec
1. Repo en GitHub (lo crea el usuario) + deploy key `~/.ssh/diandra_deploy_key`.
2. Dominio + HTTPS: con solo IP, credenciales y datos laborales viajan sin cifrar.
3. Respaldo de `uploads/` en el servidor (afecta también a RHATA y demás).
4. Logo de Diana.
5. Fase 2: control de clientes / servicios contables.
