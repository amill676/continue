import { IDE } from "../index.js";
import axios from "axios"
import YAML from "yaml"
import path from "path"


const INLET_ACCOUNT_ID = "a7da3f5286b43467355d2bd4"
const INLET_AUTH_TOKEN = '1a93MLOi0xCkP5lEdAk2fL4isVfE3IdT'
const INLET_BASE_URL = 'http://localhost:9999'

export async function request(url: string, method: string, data: any) {
    // Set headers
  const headers = {
      "Authorization": `Basic ${btoa(`${INLET_ACCOUNT_ID}:${INLET_AUTH_TOKEN}`)}`,
  }
  let fullUrl = `${INLET_BASE_URL}${url}`
  return axios.request({
    url: fullUrl,
    method,
    data,
    headers
  })
}

export async function get(url: string, data?: any) {
  if (data) {
    const params = new URLSearchParams(data).toString();
    url = `${url}${url.includes('?') ? '&' : '?'}${params}`;
  }
  return request(url, "get", undefined);  // Pass undefined instead of data for GET requests
}

export async function post(url, data) {
  return request(url, "post", data)
}

export async function patch(url, data) {
  return request(url, "patch", data)
}

export async function getWorkingDirectory(ide: IDE) {
  return (await ide.getWorkspaceDirs())[0]
}

export async function getInletProjectConfig(ide: IDE, filepath: string | undefined) {
  console.log("GETTING INLET PROJECT CONFIG")
  let result = await getInletProjectConfigAndDir(ide, filepath)
  if (!result) {
    return undefined
  }
  return result.config
}

export async function getInletProjectConfigAndDir(ide: IDE, filepath: string | undefined) {
  // Look up through parent directories until we find inlet_config.yaml
  if (filepath === undefined) {
    filepath = await getWorkingDirectory(ide)
  }
  const parts = filepath.split("/");
  console.log("PARTS", parts)
  
  // Start from current directory and work up
  for (let i = parts.length; i > 0; i--) {
    const pathToCheck = parts.slice(0, i).join("/") + "/inlet_config.yaml";
    const configDir = parts.slice(0, i).join("/");
    console.log("PATH TO CHECK", pathToCheck)
    if (await ide.fileExists(pathToCheck)) {
      const contents = await ide.readFile(pathToCheck)
      const config = JSON.parse(JSON.stringify(YAML.parse(contents)))
      console.log("Got result", config)
      if (!config) {
        return undefined
      }

      return {
        config,
        dir: configDir
      }
    }
  }
  return undefined;
}

export function flattenTargetFields(fields: any[]): any[] {
  let result = []
  for (let field of fields) {
    result.push(field)
    if (field.child_fields) {
      result.push(...flattenTargetFields(field.child_fields))
    }
  }
  return result
}

export async function fileForTarget(ide: IDE, workingDir: string, targetName: any) {
  let {config, dir} = await getInletProjectConfigAndDir(ide, workingDir)
  let mapping = config.workflow.mappings.find((m: any) => m.name === targetName)
  if (!mapping) {
    console.error(`No mapping found for target ${targetName}`)
    return undefined
  }

  // Join the working directory with the relative file path
  return path.join(dir, mapping.path)
}

export async function getFullPath(ide: IDE, filepath: string) {
  let workingDir = await getWorkingDirectory(ide)
  return path.join(workingDir, filepath)
}

export { default as YAML } from "yaml"