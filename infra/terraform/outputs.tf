output "ecr_repository_url" {
  description = "URL del repositorio ECR para subir la imagen"
  value       = aws_ecr_repository.api.repository_url
}

output "s3_bucket" {
  description = "Bucket S3 de transacciones"
  value       = aws_s3_bucket.transactions.bucket
}

output "ecs_cluster" {
  description = "Nombre del cluster ECS"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service" {
  description = "Nombre del servicio ECS"
  value       = aws_ecs_service.api.name
}

output "github_actions_role_arn" {
  description = "ARN del rol IAM que asume GitHub Actions vía OIDC"
  value       = aws_iam_role.github_actions.arn
}
