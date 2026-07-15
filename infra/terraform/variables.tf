# Variables del despliegue temporal de demostración.

variable "aws_region" {
  description = "Región AWS del despliegue"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefijo para nombrar los recursos"
  type        = string
  default     = "fincard-loyalty"
}

variable "github_repository" {
  description = "Repositorio GitHub autorizado para asumir el rol OIDC (owner/repo)"
  type        = string
  default     = "carlosacuero/fincard-transactions-api"
}

variable "container_port" {
  description = "Puerto expuesto por el contenedor"
  type        = number
  default     = 3000
}

variable "image_tag" {
  description = "Tag de la imagen Docker a desplegar"
  type        = string
  default     = "latest"
}
