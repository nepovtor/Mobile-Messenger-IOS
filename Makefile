SHELL := /bin/sh

SERVER_DIR := $(CURDIR)/server
SERVER_ENV := $(SERVER_DIR)/.env
SERVER_ENV_EXAMPLE := $(SERVER_DIR)/.env.example
SERVER_COMPOSE := $(SERVER_DIR)/docker-compose.dev.yml
SERVER_NAME := mobile-messenger-backend

.PHONY: server server-stop

server:
	@if [ ! -f "$(SERVER_ENV)" ]; then cp "$(SERVER_ENV_EXAMPLE)" "$(SERVER_ENV)"; fi
	@if [ ! -d "$(SERVER_DIR)/node_modules" ]; then npm --prefix "$(SERVER_DIR)" install; fi
	@docker compose -f "$(SERVER_COMPOSE)" up -d
	@PORT=$$(if [ -f "$(SERVER_ENV)" ]; then awk -F= '/^PORT=/{print $$2}' "$(SERVER_ENV)" | tail -n1; fi); \
	if [ -z "$$PORT" ]; then PORT=8080; fi; \
	if curl -sf "http://127.0.0.1:$$PORT/api/version" | grep -q "\"name\":\"$(SERVER_NAME)\""; then \
		echo "Backend already running on http://127.0.0.1:$$PORT/api"; \
	elif lsof -nP -iTCP:$$PORT -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $$PORT is already in use by another process."; \
		echo "Stop that process or change PORT in server/.env before running make server."; \
		exit 1; \
	else \
		npm --prefix "$(SERVER_DIR)" run start:dev; \
	fi

server-stop:
	@PORT=$$(if [ -f "$(SERVER_ENV)" ]; then awk -F= '/^PORT=/{print $$2}' "$(SERVER_ENV)" | tail -n1; fi); \
	if [ -z "$$PORT" ]; then PORT=8080; fi; \
	PID=$$(lsof -t -nP -iTCP:$$PORT -sTCP:LISTEN | head -n1); \
	if [ -n "$$PID" ]; then \
		COMMAND=$$(ps -p "$$PID" -o command=); \
		if printf '%s' "$$COMMAND" | grep -Fq "$(SERVER_DIR)"; then \
			kill "$$PID"; \
			echo "Stopped backend on port $$PORT (PID $$PID)"; \
		fi; \
	fi
	@docker compose -f "$(SERVER_COMPOSE)" down
