SHELL := /bin/bash

PROJECT_DIR := $(CURDIR)
SERVER_DIR := $(PROJECT_DIR)/server
BUILD_DIR := $(PROJECT_DIR)/build-ios

DEVICE_NAME := iPhone S
DEVICE_ID := 00008101-000210163441001E
BUNDLE_ID := com.mobilemessenger.app

PORT ?= 8080

SERVER_PID_FILE := $(PROJECT_DIR)/.server.pid
TUNNEL_PID_FILE := $(PROJECT_DIR)/.cloudflared.pid
TUNNEL_LOG := $(PROJECT_DIR)/.cloudflared.log
TUNNEL_URL_FILE := $(PROJECT_DIR)/.tunnel_url

.PHONY: help server server-stop tunnel tunnel-stop tunnel-url configure-ios build-ios install-ios launch-ios reinstall-ios up all down status clean

help:
	@echo "make server         - start backend on port $(PORT)"
	@echo "make tunnel         - start Cloudflare tunnel and save URL"
	@echo "make tunnel-url     - print current tunnel URL"
	@echo "make configure-ios  - patch iOS app config with tunnel URL"
	@echo "make build-ios      - build app for $(DEVICE_NAME)"
	@echo "make install-ios    - install app on $(DEVICE_NAME)"
	@echo "make launch-ios     - launch app on $(DEVICE_NAME)"
	@echo "make reinstall-ios  - uninstall, install, launch app"
	@echo "make up             - start backend + tunnel + patch config"
	@echo "make all            - full flow: backend + tunnel + patch + build + reinstall"
	@echo "make down           - stop tunnel and backend"
	@echo "make status         - show backend/tunnel status"
	@echo "make clean          - remove build artifacts"

server:
	@mkdir -p "$(SERVER_DIR)"
	@if [ ! -f "$(SERVER_DIR)/.env" ] && [ -f "$(SERVER_DIR)/.env.example" ]; then cp "$(SERVER_DIR)/.env.example" "$(SERVER_DIR)/.env"; fi
	@kill -9 $$(lsof -ti tcp:$(PORT)) 2>/dev/null || true
	@cd "$(SERVER_DIR)" && nohup npm run start:dev > "$(PROJECT_DIR)/.server.log" 2>&1 & echo $$! > "$(SERVER_PID_FILE)"
	@echo "Starting backend..."
	@sleep 4
	@curl -sf "http://127.0.0.1:$(PORT)/api" >/dev/null && echo "Backend is up on http://127.0.0.1:$(PORT)/api" || (echo "Backend did not start. Check .server.log"; exit 1)

server-stop:
	@if [ -f "$(SERVER_PID_FILE)" ]; then kill -9 $$(cat "$(SERVER_PID_FILE)") 2>/dev/null || true; rm -f "$(SERVER_PID_FILE)"; fi
	@kill -9 $$(lsof -ti tcp:$(PORT)) 2>/dev/null || true
	@echo "Backend stopped"

tunnel:
	@if ! command -v cloudflared >/dev/null 2>&1; then echo "cloudflared is not installed"; exit 1; fi
	@rm -f "$(TUNNEL_LOG)" "$(TUNNEL_URL_FILE)"
	@nohup cloudflared tunnel --url "http://localhost:$(PORT)" > "$(TUNNEL_LOG)" 2>&1 & echo $$! > "$(TUNNEL_PID_FILE)"
	@echo "Starting tunnel..."
	@for i in {1..20}; do \
		URL=$$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$(TUNNEL_LOG)" | head -n1); \
		if [ -n "$$URL" ]; then echo "$$URL" > "$(TUNNEL_URL_FILE)"; echo "Tunnel URL: $$URL"; exit 0; fi; \
		sleep 1; \
	done; \
	echo "Tunnel URL not found. Check $(TUNNEL_LOG)"; exit 1

tunnel-stop:
	@if [ -f "$(TUNNEL_PID_FILE)" ]; then kill -9 $$(cat "$(TUNNEL_PID_FILE)") 2>/dev/null || true; rm -f "$(TUNNEL_PID_FILE)"; fi
	@pkill -f "cloudflared tunnel --url http://localhost:$(PORT)" 2>/dev/null || true
	@echo "Tunnel stopped"

tunnel-url:
	@if [ -f "$(TUNNEL_URL_FILE)" ]; then cat "$(TUNNEL_URL_FILE)"; else echo "No tunnel URL saved"; exit 1; fi

configure-ios:
	@if [ ! -f "$(TUNNEL_URL_FILE)" ]; then echo "Tunnel URL not found. Run: make tunnel"; exit 1; fi
	@export NEW_URL="$$(cat "$(TUNNEL_URL_FILE)")"; \
	python3 -c 'import os,re,plistlib; from pathlib import Path; \
config_path=Path("MobileMessengerIOS/Shared/Config/AppConfig.swift"); \
plist_path=Path("MobileMessengerIOS/Info.plist"); \
new=os.environ["NEW_URL"].rstrip("/"); \
text=config_path.read_text(); \
text=re.sub(r"https://[A-Za-z0-9\\-]+\\.trycloudflare\\.com/api", new + "/api", text); \
text=re.sub(r"http://127\\.0\\.0\\.1:8080/api", new + "/api", text); \
text=re.sub(r"http://172\\.20\\.\\d+\\.\\d+:8080/api", new + "/api", text); \
text=re.sub(r"wss://[A-Za-z0-9\\-]+\\.trycloudflare\\.com", new.replace("https://", "wss://"), text); \
text=re.sub(r"ws://127\\.0\\.0\\.1:8080", new.replace("https://", "wss://"), text); \
text=re.sub(r"ws://172\\.20\\.\\d+\\.\\d+:8080", new.replace("https://", "wss://"), text); \
config_path.write_text(text); \
data=plistlib.loads(plist_path.read_bytes()); \
ats=data.setdefault("NSAppTransportSecurity", {}); \
ats["NSAllowsArbitraryLoads"]=True; \
plist_path.write_bytes(plistlib.dumps(data)); \
print("Configured iOS app with:", new)'

build-ios:
	@rm -rf "$(BUILD_DIR)"
	@xcodebuild \
		-project MobileMessengerIOS.xcodeproj \
		-scheme MobileMessengerIOS \
		-destination 'platform=iOS,name=$(DEVICE_NAME)' \
		-derivedDataPath "$(BUILD_DIR)" \
		build

install-ios:
	@xcrun devicectl device install app \
		--device $(DEVICE_ID) \
		"$(BUILD_DIR)/Build/Products/Debug-iphoneos/MobileMessengerIOS.app"

launch-ios:
	@xcrun devicectl device process launch \
		--device $(DEVICE_ID) \
		$(BUNDLE_ID)

reinstall-ios:
	-@xcrun devicectl device uninstall app \
		--device $(DEVICE_ID) \
		$(BUNDLE_ID)
	@xcrun devicectl device install app \
		--device $(DEVICE_ID) \
		"$(BUILD_DIR)/Build/Products/Debug-iphoneos/MobileMessengerIOS.app"
	@xcrun devicectl device process launch \
		--device $(DEVICE_ID) \
		$(BUNDLE_ID)

up: server tunnel configure-ios

all: up build-ios reinstall-ios

down: tunnel-stop server-stop

status:
	@echo "=== Backend ==="
	@curl -s "http://127.0.0.1:$(PORT)/api/version" || echo "Backend is not responding"
	@echo
	@echo "=== Tunnel ==="
	@if [ -f "$(TUNNEL_URL_FILE)" ]; then cat "$(TUNNEL_URL_FILE)"; else echo "No tunnel URL"; fi
	@echo
	@echo "=== Device ==="
	@xcrun xctrace list devices | grep "iPhone S" || true

clean:
	@rm -rf "$(BUILD_DIR)" "$(TUNNEL_LOG)" "$(TUNNEL_URL_FILE)" "$(SERVER_PID_FILE)" "$(TUNNEL_PID_FILE)" "$(PROJECT_DIR)/.server.log"
