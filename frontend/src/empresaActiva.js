const KEY = 'empresaActiva';

export function getEmpresaActiva() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function setEmpresaActiva(empresa) {
  localStorage.setItem(KEY, JSON.stringify({ id: empresa.id, razon_social: empresa.razon_social }));
}

export function clearEmpresaActiva() {
  localStorage.removeItem(KEY);
}
