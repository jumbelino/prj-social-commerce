.PHONY: dev-up dev-down dev-logs dev-migrate test-product-images-backend test-product-images-e2e

COMPOSE_FILE := infra/dev/docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

define ensure_docker
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "Error: Docker CLI not found. Install Docker and try again."; \
		exit 1; \
	fi
	@if ! docker info >/dev/null 2>&1; then \
		echo "Error: Docker daemon is not running. Start Docker and retry."; \
		exit 1; \
	fi
endef

define ensure_compose_file
	@if [ ! -f "$(COMPOSE_FILE)" ]; then \
		echo "Error: $(COMPOSE_FILE) not found yet. Create it in task 2 and rerun."; \
		exit 1; \
	fi
endef

dev-up:
	$(ensure_docker)
	$(ensure_compose_file)
	$(COMPOSE) up -d

dev-down:
	$(ensure_docker)
	$(ensure_compose_file)
	$(COMPOSE) down

dev-logs:
	$(ensure_docker)
	$(ensure_compose_file)
	$(COMPOSE) logs -f

dev-migrate:
	$(ensure_docker)
	$(ensure_compose_file)
	$(COMPOSE) run --rm --entrypoint "" backend alembic upgrade head

test-product-images-backend:
	cd backend && .venv/bin/python -m pytest tests/test_minio_storage.py tests/test_admin_product_images.py -q

test-product-images-e2e:
	npm --prefix frontend run test:e2e:product-images
