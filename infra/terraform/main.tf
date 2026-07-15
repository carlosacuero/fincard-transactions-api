# =============================================================================
# Despliegue temporal de demostración (3-4 días) — FinCard Loyalty API
# ECS Fargate con IP pública (sin ALB para minimizar costos), S3, Glue y ECR.
# Para eliminar todo al terminar la demo: terraform destroy
# =============================================================================

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "demo"
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

# --- Red: se usa la VPC por defecto para no crear NAT/VPC nuevas (costo $0) ---
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# --- ECR: repositorio de la imagen Docker ---
resource "aws_ecr_repository" "api" {
  name         = var.project_name
  force_delete = true # demo temporal: permite destruir aunque tenga imágenes
}

# --- S3: bucket de transacciones (RF-02) ---
resource "aws_s3_bucket" "transactions" {
  bucket        = "${var.project_name}-transactions-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # demo temporal
}

resource "aws_s3_bucket_public_access_block" "transactions" {
  bucket                  = aws_s3_bucket.transactions.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Glue Data Catalog (RF-03): la aplicación crea la base y la tabla,
#     aquí solo se otorgan los permisos vía IAM ---

# --- CloudWatch Logs ---
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 7
}

# --- ECS: cluster, task definition y servicio Fargate ---
resource "aws_ecs_cluster" "main" {
  name = var.project_name
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.project_name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Rol de la aplicación: acceso mínimo a S3 (solo el bucket) y Glue (solo la BD del proyecto).
resource "aws_iam_role" "task" {
  name               = "${var.project_name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task_permissions" {
  statement {
    sid       = "S3Transactions"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.transactions.arn, "${aws_s3_bucket.transactions.arn}/*"]
  }

  statement {
    sid = "GlueCatalog"
    actions = [
      "glue:GetDatabase",
      "glue:CreateDatabase",
      "glue:GetTable",
      "glue:CreateTable",
      "glue:UpdateTable"
    ]
    resources = [
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:database/fincard_loyalty",
      "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/fincard_loyalty/*"
    ]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${var.project_name}-task-permissions"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_permissions.json
}

resource "aws_ecs_task_definition" "api" {
  family                   = var.project_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256 # 0.25 vCPU: tamaño mínimo, suficiente para la demo
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name         = "api"
      image        = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      essential    = true
      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment = [
        { name = "PORT", value = tostring(var.container_port) },
        { name = "STORAGE_DRIVER", value = "aws" },
        { name = "S3_BUCKET", value = aws_s3_bucket.transactions.bucket },
        { name = "AWS_REGION", value = var.aws_region }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_security_group" "api" {
  name        = "${var.project_name}-api"
  description = "Permite HTTP hacia la API de la demo"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "API HTTP"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # demo pública temporal
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ecs_service" "api" {
  name            = var.project_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true # sin ALB: la tarea recibe IP pública directa
  }
}
