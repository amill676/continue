import { IDE } from "../index.js";
import { AutocompleteInput } from "../autocomplete/util/types.js";
import * as inletUtils from "./utils.js"


// export interface InletProjectConfig {
//   workflowId: string
//   projectType: string
// }


export async function getVariableDataSnippets(autocompleteInput: AutocompleteInput, ide: IDE) {
  const { filepath, pos } = autocompleteInput
  const inletProjectConfig = await inletUtils.getInletProjectConfig(ide, filepath)

  if (!inletProjectConfig) {
    return []
  }

  const workflowId = inletProjectConfig.workflow.id
  if (!workflowId) {
    console.error("No workflow ID found in inlet_config.yaml")
    return []
  }
  // Find the mapping target
  let target = null
  let mappings = inletProjectConfig?.workflow?.mappings || []
  mappings.forEach(mapping => {
    if (filepath.endsWith(mapping.path)) {
      target = mapping.name
    }
  })

  if (!target) {
    return []
  }

  let data = {
    target_name: target
  }
  const response = await inletUtils.get(`/v0/workflows/${workflowId}/mappingsnippets`, data)
  const result = response.data

  return `
    Field Info:\n${result.field_text}\n\nSource Info:\n\n${result.source_info}\n\nVariable Data:\n\n${result.data_text}`
}