# ADR — Despliegue en AWS (demo temporal)

## ADR-007: ECS Fargate con IP pública, sin ALB

- **Estado**: Aceptada
- **Contexto**: el despliegue es una demostración temporal (3-4 días) para
  evidenciar que la solución funciona en AWS; el costo debe ser mínimo.
- **Decisión**: 1 tarea Fargate (0.25 vCPU / 0.5 GB) con IP pública directa.
  Se descartó el ALB (~$18/mes) y también Lambda (habría requerido adaptar el
  empaquetado; con Fargate el `Dockerfile` se usa tal cual).
- **Consecuencias**: (+) costo total ~$1-2 USD por los 4 días; (−) la IP
  pública cambia si la tarea se reinicia — aceptable para la demo. En
  producción se usaría ALB + auto scaling + dominios.

## ADR-008: OIDC entre GitHub Actions y AWS

- **Estado**: Aceptada
- **Contexto**: se necesita CI/CD sin almacenar credenciales AWS de larga
  duración en GitHub.
- **Decisión**: Terraform crea un IAM OIDC Provider para
  `token.actions.githubusercontent.com` y un rol cuyo trust policy solo
  permite `sts:AssumeRoleWithWebIdentity` desde el repositorio del proyecto.
  El workflow usa `aws-actions/configure-aws-credentials` con
  `role-to-assume`, con permisos mínimos (push a un ECR, update de un servicio
  ECS y PassRole de los dos roles de la tarea).
- **Consecuencias**: (+) cero secretos de AWS en GitHub, tokens de corta
  duración, permisos acotados; (−) requiere un `terraform apply` inicial con
  credenciales de administrador (bootstrap único).

## ADR-009: Adaptadores AWS seleccionables por configuración

- **Estado**: Aceptada
- **Contexto**: la arquitectura hexagonal ya define los puertos `FileStorage`
  y `DataCatalog` con implementaciones locales emuladas.
- **Decisión**: se añaden `S3FileStorage` (AWS SDK v3 - S3) y `GlueDataCatalog`
  (AWS SDK v3 - Glue), seleccionados en el arranque con `STORAGE_DRIVER=aws` y
  `S3_BUCKET`. En ECS la tarea recibe estas variables y las credenciales llegan
  por el task role (sin access keys).
- **Consecuencias**: el dominio, los casos de uso y las pruebas no cambian;
  el mismo binario sirve para local y AWS.
