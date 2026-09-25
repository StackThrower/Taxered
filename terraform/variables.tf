variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "The name of the Cloud Run service"
  type        = string
  default     = "tax-declaration-app"
}

variable "container_port" {
  description = "The port the container listens on"
  type        = number
  default     = 3000
}

variable "memory" {
  description = "Memory allocated to each Cloud Run instance"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU allocated to each Cloud Run instance"
  type        = string
  default     = "1"
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

