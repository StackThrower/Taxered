output "service_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.name
}

output "artifact_registry_repository" {
  description = "The Artifact Registry repository name"
  value       = google_artifact_registry_repository.app_repo.name
}

output "region" {
  description = "The deployment region"
  value       = var.region
}

