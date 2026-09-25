# Enable required Google Cloud APIs
resource "google_project_service" "cloud_run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_build" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# Create Artifact Registry repository for Docker images
resource "google_artifact_registry_repository" "app_repo" {
  location      = var.region
  repository_id = var.service_name
  description   = "Docker repository for ${var.service_name}"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry]
}

# Cloud Run service (v2)
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.service_name}/${var.service_name}:latest"

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          memory = var.memory
          cpu    = var.cpu
        }
      }

      # Environment variables (add as needed)
      # env {
      #   name  = "NODE_ENV"
      #   value = "production"
      # }
    }

    scaling {
      max_instance_count = var.max_instances
      min_instance_count = var.min_instances
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.cloud_run,
    google_artifact_registry_repository.app_repo
  ]

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# Make Cloud Run service publicly accessible
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

