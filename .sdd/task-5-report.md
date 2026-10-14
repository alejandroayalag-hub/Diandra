# Task 5: Missing `empresaId` Required Field Validation — FIXED

## Status
**FIXED**

## Issue Summary
The `createSalida` controller was missing `empresaId` from the required-field validation check, violating:
1. The explicit brief requirement: `if (!empleadoId || !empresaId || !fechaSalida || !tipoSalida || !razonSalida)`
2. The global multi-tenant constraint: all queries must filter by `empresa_id`

## Changes Made

### 1. Fixed Controller Validation
**File:** `/home/alejandroayalag/rhata/backend/src/controllers/salidasController.js` (line 52)

**Before:**
```javascript
if (!empleadoId || !fechaSalida || !tipoSalida || !razonSalida) {
  return res.status(400).json({ error: 'Campos requeridos: empleadoId, fechaSalida, tipoSalida, razonSalida' });
}
```

**After:**
```javascript
if (!empleadoId || !empresaId || !fechaSalida || !tipoSalida || !razonSalida) {
  return res.status(400).json({ error: 'Campos requeridos: empleadoId, empresaId, fechaSalida, tipoSalida, razonSalida' });
}
```

### 2. Added Test Coverage
**File:** `/home/alejandroayalag/rhata/backend/tests/controllers/salidas.test.js`

**New test case:** "debe retornar 400 si empresaId está faltando"
- Validates that the endpoint returns 400 when `empresaId` is missing
- Verifies the error message includes `empresaId`
- Confirms the controller doesn't proceed to database operations

## Test Results

```
PASS tests/controllers/salidas.test.js
  Controller: salidasController
    getAllSalidas
      ✓ debe retornar todas las salidas sin filtros
      ✓ debe aplicar filtros de estado, empresaId y empleadoId
      ✓ debe retornar 400 si el estado es inválido
    getSalidaById
      ✓ debe retornar la salida con sus documentos
      ✓ debe retornar 404 si la salida no existe
    getSalidasByEmpleado
      ✓ debe retornar las salidas de un empleado
    createSalida
      ✓ debe crear una salida y 4 documentos de salida
      ✓ debe retornar 400 si faltan campos requeridos
      ✓ debe retornar 400 si empresaId está faltando ← NEW
      ✓ debe retornar 400 si tipoSalida no es válido
      ✓ debe retornar 404 si el empleado no existe
      ✓ debe retornar 400 si el empleado está inactivo
    updateSalida
      ✓ debe actualizar la salida
      ✓ debe retornar 400 si estado es inválido
      ✓ debe retornar 400 si tipoSalida es inválido
      ✓ debe retornar 404 si la salida no existe
    deleteSalida
      ✓ debe eliminar la salida y sus documentos si está pendiente
      ✓ debe retornar 404 si la salida no existe
      ✓ debe retornar 400 si la salida no está pendiente
    getSalidasByEstado
      ✓ debe retornar salidas filtradas por estado
      ✓ debe retornar 400 si el estado es inválido
    manejo de errores
      ✓ debe llamar a next(err) si el modelo lanza una excepción

Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        0.488 s, estimated 1 s
```

## Commit
```
da86f25 fix: agregar empresaId como campo requerido en createSalida
```

## Verification Checklist
- [x] `empresaId` is now required in the validation check
- [x] Error message explicitly mentions `empresaId`
- [x] New test case added for missing `empresaId`
- [x] All 22 tests pass (including the new one)
- [x] Complies with brief requirement and multi-tenant constraint
- [x] Commit includes proper message and co-author attribution

## Notes
- The fix ensures that all salida records are created with an `empresaId`, which is essential for multi-tenant filtering
- The test suite confirms the validation is enforced and prevents invalid requests from reaching the database layer
- This fix aligns with the explicit brief specification and the global architecture constraint
