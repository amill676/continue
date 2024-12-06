import { BaseContextProvider } from "../";
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  LoadSubmenuItemsArgs,
} from "../../";
import * as inletUtils from "../../inlet/utils";
import * as maptools from "../../inlet/maptools";

class InletContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "inlet", // Unique identifier
    displayTitle: "Inlet", // Display name in dropdown
    type: "submenu", // Can be "normal", "query", or "submenu"
    description: "",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    console.log("GOT QUERY", query)
    // Implement your logic here to return context items
    let [type, workflowId, sourceId] = query.split(':')
    if (!workflowId || !sourceId) {
      return []
    }
    if (type === 'source') {
      // Make a request to get the mapping sources for that workflow ID
      const response = await inletUtils.get(
        `/v0/workflows/${workflowId}/mappingsources/${sourceId}/data`,
      )
      let exampleData = response.data
      let compressed = maptools.compressExample(exampleData)
      let content = `Invoices source data:\n\`\`\`json\n${JSON.stringify(compressed, null, 2)}\n\`\`\``
      return [{
        name: query,
        content: content,
        description: 'Inlet source',
      }]
    } else if (type === 'target') {
      // Make a request to get the mapping targets for that workflow ID
      const response = await inletUtils.get(
        `/v0/workflows/${workflowId}/mappingtargets/${sourceId}/data`,
      )
      let target = response.data
      let fields = inletUtils.flattenTargetFields(target.fields)
      let content = `Mapping Target ${target.name}\nFields:\n\`\`\`json\n${JSON.stringify(fields, null, 2)}\n\`\`\``
      return [{
        name: query,
        content: content,
        description: 'Inlet target',
      }]
    }
  }

  async loadSubmenuItems(args: LoadSubmenuItemsArgs) {
    // Get the current file path
    const filePath = await args.ide.getCurrentFile()
    if (!filePath?.path) {
      return []
    }
    // Get the inlet config based on the current file path
    const inletProjectConfig = await inletUtils.getInletProjectConfig(args.ide, filePath.path)
    // Get the workflow ID from the inlet config
    const workflowId = inletProjectConfig?.workflow?.id
    // Make a request to get the mapping sources for that workflow ID
    const response = await inletUtils.get(
      `/v0/workflows/${workflowId}/mappingsources`,
    )
    const mappingSources = response.data.results.map((source: any) => {
      return {
        id: 'source:' + workflowId + ':' + source.id,
        title: 'Source: ' + source.name,
        metadata: {
          sourceId: source.id,
          workflowId: workflowId,
        },
      }
    })

    // Now get mapping targets
    const targetsResponse = await inletUtils.get(
      `/v0/workflows/${workflowId}/mappingtargets`,
    )
    const mappingTargets = targetsResponse.data.results.map((target: any) => {
      return {
        id: 'target:' + workflowId + ':' + target.id,
        title: 'Target: ' + target.name,
        metadata: {
          targetId: target.id,
          workflowId: workflowId,
        },
      }
    })
    // Return the mapping sources
    return mappingSources.concat(mappingTargets)
  }
}

export default InletContextProvider;
