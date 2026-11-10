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
  default     = "1Gi"
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


variable "anthropic_api_key_secret" {
  description = "Secret Manager secret id holding ANTHROPIC_API_KEY for the chat agent; empty disables the agent"
  type        = string
  default     = ""
}

variable "agent_model" {
  description = "Claude model of the chat agent"
  type        = string
  default     = "claude-haiku-5-5"
}
