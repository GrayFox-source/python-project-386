SHELL := /bin/bash

.PHONY: setup generate generate-openapi generate-frontend generate-backend check-contract

## Install all dependencies (api-spec, frontend, backend).
setup:
	npm --prefix api-spec ci
	npm --prefix frontend ci
	uv sync --project backend --dev

## Run the whole generation chain: TypeSpec -> OpenAPI -> Frontend SDK + Backend models.
generate:
	$(MAKE) generate-openapi
	$(MAKE) generate-frontend
	$(MAKE) generate-backend

## Compile TypeSpec into api-spec/openapi.yaml.
generate-openapi:
	npm --prefix api-spec run compile

## Generate the typed frontend client from OpenAPI.
generate-frontend:
	npm --prefix frontend run generate:api

## Generate Pydantic models from OpenAPI.
generate-backend:
	mkdir -p backend/generated
	cd backend && uv run datamodel-codegen \
		--input ../api-spec/openapi.yaml \
		--output generated/models.py \
		--input-file-type openapi \
		--output-model-type pydantic_v2.BaseModel \
		--openapi-scopes schemas \
		--target-python-version 3.14 \
		--formatters builtin \
		--use-standard-collections \
		--use-union-operator \
		--use-annotated \
		--disable-timestamp
	cd backend && uv run python -c "import generated.models"

## Fail if the committed openapi.yaml drifts from main.tsp.
check-contract:
	$(MAKE) generate-openapi
	git diff --exit-code -- api-spec/openapi.yaml
