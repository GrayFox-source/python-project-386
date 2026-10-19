import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  input: "../api-spec/openapi.yaml",
  output: "src/api/generated",
})
