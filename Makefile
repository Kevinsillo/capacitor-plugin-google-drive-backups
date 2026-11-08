# Common commands for the plugin. Run `make help` for the list.
#
# Android targets need JDK 21 and the Android SDK. Override these when they live elsewhere:
#   make android JAVA_HOME=/path/to/jdk-21 ANDROID_HOME=/path/to/sdk

JAVA_HOME ?= /usr/lib/jvm/java-21-openjdk-amd64
ANDROID_HOME ?= $(HOME)/Android/Sdk
export JAVA_HOME ANDROID_HOME

.DEFAULT_GOAL := help
.PHONY: help setup build watch test test-ts test-kt typecheck lint format android check pack clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-12s %s\n", $$1, $$2}'

setup: ## Install npm dependencies
	npm install

build: ## Regenerate the API docs and build dist/
	npm run build

watch: ## Compile src/ on every change
	npm run watch

test: test-ts test-kt ## Run the TypeScript and Kotlin test suites

test-ts: ## Run the Vitest suite
	npm test

test-kt: ## Run the Gradle (JUnit) suite
	cd android && ./gradlew test --no-daemon

typecheck: ## Type-check all sources and tests
	npm run typecheck

lint: ## ESLint and Prettier checks
	npm run lint

format: ## Apply ESLint and Prettier fixes
	npm run fmt

android: ## Build the Android library (debug)
	cd android && ./gradlew assembleDebug --no-daemon

check: ## License and tree-shaking checks (run build first)
	npm run check:license
	npm run check:tree-shaking

pack: build ## Dry-run the npm package to review its contents
	npm pack --dry-run

clean: ## Remove build output
	npm run clean
	rm -rf android/build
