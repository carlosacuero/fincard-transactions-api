# Architecture Decision Records (ADR)

## ADR-001: Arquitectura Hexagonal (Ports & Adapters)

- **Estado**: Aceptada
- **Contexto**: el sistema debe integrarse con AWS (S3, Glue) pero desarrollarse
  y probarse en local, y el enunciado exige alta testabilidad y calidad.
- **Decisión**: el dominio y los casos de uso dependen solo de interfaces
  (`TransactionRepository`, `FileStorage`, `DataCatalog`). Los adaptadores
  locales (archivos/JSON) se inyectan en el arranque.
- **Consecuencias**: (+) pruebas unitarias con fakes en memoria, migración a
  AWS implementando nuevos adaptadores sin tocar la lógica de negocio.
  (−) más archivos e indirección que un CRUD monolítico.

## ADR-002: Fastify como framework HTTP

- **Estado**: Aceptada
- **Contexto**: el enunciado especifica Fastify; además se necesita
  documentación OpenAPI.
- **Decisión**: Fastify 5 con `@fastify/swagger` y `@fastify/swagger-ui`. Los
  esquemas JSON de cada ruta sirven a la vez para validar y para documentar.
- **Consecuencias**: (+) validación automática de parámetros, documentación
  siempre sincronizada con el código, alto rendimiento.

## ADR-003: Emulación local de S3 y Glue detrás de puertos

- **Estado**: Aceptada
- **Contexto**: el enunciado permite emular AWS en local para desarrollo.
- **Decisión**: `LocalFileStorage` escribe en
  `storage/fincard-transactions/{year}/{month}/{partner_id}/` y
  `LocalGlueCatalog` persiste la base `fincard_loyalty` y la tabla
  `transactions` en `data/glue-catalog.json`.
- **Consecuencias**: (+) desarrollo sin credenciales AWS; el contrato del
  puerto garantiza que el adaptador real (AWS SDK v3) sea un reemplazo directo.

## ADR-004: Persistencia en JSON local para la prueba

- **Estado**: Aceptada
- **Contexto**: no se exige una base de datos concreta; el foco es la lógica de
  negocio y la arquitectura.
- **Decisión**: `JsonTransactionRepository` guarda `transactions.json` y
  `transactions_flagged.json` (tabla separada exigida por RF-05).
- **Consecuencias**: (+) cero dependencias de infraestructura; (−) no apto para
  concurrencia alta — en producción se sustituiría por PostgreSQL/DynamoDB
  implementando el mismo puerto.

## ADR-005: Estrategia de respuesta ante archivos parcialmente inválidos

- **Estado**: Aceptada
- **Contexto**: RF-01 exige responder `400` con el detalle de errores por fila;
  RF-02 exige procesar las transacciones válidas y generar un manifiesto con
  filas válidas y rechazadas.
- **Decisión**: se procesan las filas válidas siempre que exista al menos una;
  si hay errores la respuesta es `400` e incluye el detalle por fila y el
  manifiesto (con hash SHA-256 del archivo original). Si el archivo completo es
  inválido (sin filas válidas, columnas faltantes o no-CSV) no se procesa nada.
- **Consecuencias**: cumple ambos requisitos a la vez y evita reprocesar
  archivos completos por una sola fila errónea.

## ADR-006: Reglas de negocio como funciones puras

- **Estado**: Aceptada
- **Contexto**: RN-01..RN-04 deben ser fáciles de probar y de evolucionar, con
  complejidad ciclomática baja.
- **Decisión**: cada regla es una función pura `(Transaction[]) -> FlagResult[]`
  y `applyBusinessRules` las compone y consolida motivos por transacción. Las
  transacciones marcadas van a `transactions_flagged` y no afectan la
  liquidación.
- **Consecuencias**: (+) cada regla se prueba de forma aislada; agregar una
  regla nueva no modifica las existentes (Open/Closed).
