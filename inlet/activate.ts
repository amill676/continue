import * as vscode from "vscode";
import { YAML } from "../core/inlet/utils"

import { InletMappingWebviewProvider } from "./InletMappingWebviewProvider";
import { InletInspectPanelWebviewProvider, } from "./InletInspectPanelWebviewProvider"
import * as inletUtils from "../core/inlet/utils"
import { exec } from "child_process";
import { VsCodeExtension } from "../extensions/vscode/src/extension/VsCodeExtension";
import { VsCodeIde } from "../extensions/vscode/src/VsCodeIde";
import { deterministicApplyLazyEdit } from "../core/edit/lazy/deterministic";
import path from "path";

// Add this at the top of the file, outside any function
let mappingPanel: vscode.WebviewPanel | undefined;
let inspectPanel: vscode.WebviewPanel | undefined;

let mappingInProgress = false;

class InletExtension {
  constructor(public extension: VsCodeExtension) {
    this.extension = extension
  }

  async handleMessages(message: any, webview: vscode.Webview) {
    console.log("Inlet Extension got message", message);
    try {
      let response;
      
      switch (message.command) {
        case 'getTargetCode':
          const code = await this.getTargetCode(message.data.targetName);
          response = { code };
          break;
        case 'applyMapping':
          if (mappingInProgress) {
            // this lock exists to prevent diffs from getting screwed up
            console.warn("Mapping already in progress - skipping new mapping");
            break;
          }
          mappingInProgress = true;
          await this.applyMapping(message.data.target, message.data.field, message.data.mapping)
          mappingInProgress = false;
          break;
        case 'acceptDiff':
          await this.acceptDiff(message.data.targetName)
          break;
        case 'rejectDiff':
          await this.rejectDiff(message.data.targetName)
          break;
      }

      // Send success response
      webview.postMessage({ 
        id: message.id,
        response: response
      });
    } catch (error) {
      console.error("Error handling messaging from webview", error)
      // Send error response
      webview.postMessage({ 
        id: message.id,
        error: error.message
      });
    }
  }

  async acceptDiff(targetName: string) {
    let workingDir = await inletUtils.getWorkingDirectory(this.extension.ide) 
    let filepath = await inletUtils.fileForTarget(this.extension.ide, workingDir, targetName)
    console.log("Accepting diff for target", targetName, filepath)
    await vscode.commands.executeCommand('continue.acceptDiff', filepath);
  }

  async rejectDiff(targetName: string) {
    let workingDir = await inletUtils.getWorkingDirectory(this.extension.ide) 
    let filepath = await inletUtils.fileForTarget(this.extension.ide, workingDir, targetName)
    console.log("Rejecting diff for target", targetName, filepath)
    await vscode.commands.executeCommand('continue.rejectDiff', filepath);
  }

  async getTargetCode(targetName: string) {
    let workingDir = await inletUtils.getWorkingDirectory(this.extension.ide) 
    let filepath = await inletUtils.fileForTarget(this.extension.ide, workingDir, targetName)
    return await this.extension.ide.readFile(filepath)
  }

  async applyMapping(target, field, mapping) {
    console.log("APPLYING MAPPING")
    console.log('mapping args: ', target, field, mapping)
    // Get current directory
    const workingDirs = await this.extension.ide.getWorkspaceDirs()
    const filepath = await inletUtils.fileForTarget(this.extension.ide, workingDirs[0], target.name)
    console.log("Applying mapping to file", filepath)
    
    // Find any existing editor with this file open
    const editors = vscode.window.visibleTextEditors
    const existingEditor = editors.find(e => e.document.uri.fsPath === filepath)
    
    if (existingEditor) {
      // Focus the existing editor
      await vscode.window.showTextDocument(existingEditor.document, {
        viewColumn: existingEditor.viewColumn,
        preserveFocus: false
      })
      // Show the diff in the current editor
      const document = existingEditor.document
      const currentContent = await this.extension.ide.readFile(filepath)
      const newContent = mapping.new_mapping_code
      console.log('MAPPING: currentContent: ', currentContent)
      console.log('MAPPING: newContent: ', newContent)
      console.log('MAPPING: filepath: ', filepath)
      const diffLines = await deterministicApplyLazyEdit(
        currentContent,
        newContent,
        filepath
      )
      console.log('activate.ts applyMapping() diffLines: ', diffLines)

      const verticalDiffManager = this.extension.verticalDiffManager
      await verticalDiffManager.streamDiffLines(diffLines, false, "inlet-mapping")


    } else {
      // No existing editor found, show diff in new editor
      this.extension.ide.showDiff(file, mapping.new_mapping_code, 0)
    }
  }


  // // Copied from VScodeMessenger.ts
  // this.onWebview("applyToFile", async ({ data }) => {
  //   let filepath = data.filepath;

  //   // If there is a filepath, verify it exists and then open the file
  //   if (filepath) {
  //     const fullPath = getFullyQualifiedPath(ide, filepath);

  //     if (!fullPath) {
  //       return;
  //     }

  //     const fileExists = await this.ide.fileExists(fullPath);

  //     // If it's a new file, no need to apply, just write directly
  //     if (!fileExists) {
  //       await this.ide.writeFile(fullPath, data.text);
  //       await this.ide.openFile(fullPath);

  //       await webviewProtocol.request("updateApplyState", {
  //         streamId: data.streamId,
  //         status: "done",
  //         numDiffs: 0,
  //       });

  //       return;
  //     }

  //     await this.ide.openFile(fullPath);
  //   }

  //   // Get active text editor
  //   const editor = vscode.window.activeTextEditor;

  //   if (!editor) {
  //     vscode.window.showErrorMessage("No active editor to apply edits to");
  //     return;
  //   }

  //   // If document is empty, insert at 0,0 and finish
  //   if (!editor.document.getText().trim()) {
  //     editor.edit((builder) =>
  //       builder.insert(new vscode.Position(0, 0), data.text),
  //     );
  //     await webviewProtocol.request("updateApplyState", {
  //       streamId: data.streamId,
  //       status: "done",
  //       numDiffs: 0,
  //     });
  //     return;
  //   }

  //   // Get LLM from config
  //   const configHandler = await configHandlerPromise;
  //   const config = await configHandler.loadConfig();

  //   let llm = getModelByRole(config, "applyCodeBlock");

  //   if (!llm) {
  //     llm = config.models.find(
  //       (model) => model.title === data.curSelectedModelTitle,
  //     );

  //     if (!llm) {
  //       vscode.window.showErrorMessage(
  //         `Model ${data.curSelectedModelTitle} not found in config.`,
  //       );
  //       return;
  //     }
  //   }

  //   const fastLlm = getModelByRole(config, "repoMapFileSelection") ?? llm;

  //   // Generate the diff and pass through diff manager
  //   const [instant, diffLines] = await applyCodeBlock(
  //     editor.document.getText(),
  //     data.text,
  //     getBasename(editor.document.fileName),
  //     llm,
  //     fastLlm,
  //   );
  //   const verticalDiffManager = await this.verticalDiffManagerPromise;
  //   if (instant) {
  //     await verticalDiffManager.streamDiffLines(
  //       diffLines,
  //       instant,
  //       data.streamId,
  //     );
  //   } else {
  //     const prompt = `The following code was suggested as an edit:\n\`\`\`\n${data.text}\n\`\`\`\nPlease apply it to the previous code.`;
  //     const fullEditorRange = new vscode.Range(
  //       0,
  //       0,
  //       editor.document.lineCount - 1,
  //       editor.document.lineAt(editor.document.lineCount - 1).text.length,
  //     );
  //     const rangeToApplyTo = editor.selection.isEmpty
  //       ? fullEditorRange
  //       : editor.selection;

  //     await verticalDiffManager.streamEdit(
  //       prompt,
  //       llm.title,
  //       data.streamId,
  //       undefined,
  //       undefined,
  //       rangeToApplyTo,
  //     );
  //   }
  // });











}
let inletExtension: InletExtension | undefined;

export function inletActivate(
    context: vscode.ExtensionContext,
    extension: VsCodeExtension
  ) {
  console.log("inletActivate");
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "continue.inletPanel",
      new InletInspectPanelWebviewProvider(context),
    ),
  );
  inletExtension = new InletExtension(extension)

  context.subscriptions.push(
    vscode.commands.registerCommand("inlet.runWorkflow", runWorkflow),
    vscode.commands.registerCommand("inlet.runMapping", runMapping.bind(null, inletExtension,context)),
    vscode.commands.registerCommand("inlet.openInspector", openInspector.bind(null, inletExtension,context)),
    vscode.commands.registerCommand(
      "inlet.openMappingView", 
      openMappingView.bind(null, inletExtension, context)
    ),
    vscode.commands.registerCommand(
      "inlet.syncWorkflow", syncWorkflow.bind(null, inletExtension, context))
  );

  // Register the diff manager
  vscode.commands.executeCommand('setContext', 'continue.hasVerticalDiffManager', true)
}


async function runWorkflow() {
  console.log("runWorkflow");
}

async function getWorkflowId(ide: VsCodeIde, filePath: string) {
  const inletProjectConfig = await inletUtils.getInletProjectConfig(ide, filePath)
  return inletProjectConfig?.workflow?.id
}

async function openMappingView(inletExtension: InletExtension, context: vscode.ExtensionContext) {
  // GEt the name of the current file
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const filePath = editor.document.uri.fsPath;
  console.log(filePath);

  // Get the workflow id for the given file
  const workflowId = await getWorkflowId(inletExtension.extension.ide, filePath);

  // Create/show panel after command completes
  let panel;
  if (mappingPanel) {
    panel = mappingPanel;
    panel.reveal();
  } else {
    panel = vscode.window.createWebviewPanel(
      'inletMapping',
      'Inlet Mappings',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    
    // Store the panel reference
    mappingPanel = panel;
    
    // Clean up reference when panel is disposed
    panel.onDidDispose(() => {
      mappingPanel = undefined;
    });
  }
  const provider = new InletMappingWebviewProvider(context);
  panel.webview.html = provider.getPanelHtml(context, panel);
  panel.webview.onDidReceiveMessage(
    (message) => inletExtension.handleMessages(message, panel.webview)
  )

  // Send messages to update the panel
  panel.webview.postMessage({
    command: 'setWorkflowId',
    data: workflowId
  });

  panel.webview.postMessage({
    command: 'refreshMapping',
  });
  return panel;
}

async function openInspector(inletExtension: InletExtension, context: vscode.ExtensionContext) {
  // Get the name of the current file
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const filePath = editor.document.uri.fsPath;
  console.log(filePath);

  // Get the workflow id for the given file
  const workflowId = await getWorkflowId(inletExtension.extension.ide, filePath);

  let panel;
  if (inspectPanel) {
    panel = inspectPanel;
    panel.reveal();
  } else {
    panel = vscode.window.createWebviewPanel(
      'inletInspector',
      'Inlet Inspector',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    
    // Store the panel reference
    inspectPanel = panel;
    
    // Clean up reference when panel is disposed
    panel.onDidDispose(() => {
      inspectPanel = undefined;
    });
    
    const provider = new InletInspectPanelWebviewProvider(context)
    panel.webview.html = provider.getPanelHtml(context, panel)

    // Send messages to update the panel
    panel.webview.postMessage({
      command: 'setWorkflowId',
      data: workflowId
    });
  }
}

async function runMapping(inletExtension: InletExtension, context: vscode.ExtensionContext) {
  // GEt the name of the current file
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const filePath = editor.document.uri.fsPath;

  openMappingView(inletExtension, context)

  // Find existing Inlet Mapping terminal or create new one
  let terminal = vscode.window.terminals.find(t => t.name === 'Inlet Mapping');
  if (!terminal) {
    console.log("Creating new Inlet Mapping terminal");
    terminal = vscode.window.createTerminal('Inlet Mapping');
  }
  terminal.show()
  terminal.sendText(`inlet map --file "${filePath}"`);
}

async function syncWorkflow(inletExtension: InletExtension, context: vscode.ExtensionContext) {
  const ide = inletExtension.extension.ide;
  let config = await inletUtils.getInletProjectConfig(ide);
  if (!config?.include || !Array.isArray(config.include)) {
    throw new Error("No include patterns specified in inlet config");
  }

  // Process each include pattern
  for (const pattern of config.include) {
    // Get absolute path by resolving relative to workspace
    const workspaceDirs = await ide.getWorkspaceDirs();
    if (!workspaceDirs.length) {
      throw new Error("No workspace directory found");
    }

    const baseDir = workspaceDirs[0];
    const absolutePattern = await inletUtils.getFullPath(ide, pattern);
    console.log('absolutePattern: ', absolutePattern);
    if (!absolutePattern) continue;

    // Find all sources in the given absolute pattern
    const sources = await findSources(absolutePattern);
    console.log('sources: ', sources);
    if (sources == null) continue;
    await syncSources(config.workflow.id, sources);

    // // Find all SQL files matching the glob pattern
    // const sqlFiles = await findSqlFiles(absolutePattern);
    // for (const filepath of sqlFiles) {
    //   const content = await ide.readFile(filepath);
    //   if (content) {
    //     // Get just the filename without extension
    //     const targetName = filepath.split('/').pop()?.replace(/\.sql$/, '');
    //     if (!targetName) continue;
    //     await updateMappingCode(config, targetName, content);
    //   }
    // }
  }

  async function syncSources(workflowId: string, sources: any[]) {
    console.log('syncSources(): ', workflowId, sources);
    for (const source of sources) {
      const data = {
        text: '',
        input_type: 'warehouse',
        warehouse_type: 'bigquery',
        warehouse_fields: {
          project_id: source.database,
          dataset_id: source.schema,
          table_id: source.table
        },
        upsert: true
      }
      console.log('making request...')
      const response = await inletUtils.post(
        `/v0/workflows/${workflowId}/inputfields/`,
        data
      )
      console.log('response: ', response);
    }
  }

  async function findSources(absolutePattern: string) {
    // find `schema.yml` in the given absolute pattern
    const baseDir = absolutePattern.endsWith('*') 
    ? absolutePattern.slice(0, -1) 
    : absolutePattern;
    const schemaYmlPath = path.join(baseDir, 'schema.yml');
    if (!schemaYmlPath) return;
    const schemaYmlContent = await ide.readFile(schemaYmlPath);
    if (!schemaYmlContent) return;
    // parse the schema.yml file
    const schema = YAML.parse(schemaYmlContent)
    console.log('schema.yml: ', schema);
    const sources = [];
    for (const source of schema.sources) {
      console.log('source: ', source);
      const name = source.name;
      const database = source.database;
      const schema = source.schema;
      for (const table of source.tables) {
        const tableName = table.name;
        sources.push({
          name: name,
          database: database,
          schema: schema,
          table: tableName,
        })
      }
    }
    return sources;
  }
}

async function findSqlFiles(globPattern: string): Promise<string[]> {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  // Convert absolute path to workspace-relative path
  let relPath = globPattern;
  if (globPattern.startsWith(workspaceRoot)) {
    relPath = globPattern.substring(workspaceRoot.length + 1); // +1 for the trailing slash
  }
  // Convert the glob pattern to VSCode format
  const pattern = relPath.endsWith('*')
    ? relPath.slice(0, -1) + '{**/*.sql,*.sql}'  // Match both nested and direct .sql files
    : relPath + '{**/*.sql,*.sql}';              // Match both nested and direct .sql files
  // Create a proper VSCode relative pattern
  const relativePattern = new vscode.RelativePattern(
    vscode.workspace.workspaceFolders![0],
    pattern.replace(/^\/+/, '') // Remove leading slashes
  );
  const files = await vscode.workspace.findFiles(relativePattern);
  return files.map(file => file.fsPath);
}

async function updateMappingCode(config, targetName, mappingCode) {
  console.log('updateMappingCode(): ', targetName)
  // SEAN TODO: change this part to hit a /mappingtargets endpoint that upserts the targets,
  // using each target's name as the unique ID
  // Get the mapping target
  const targetsResponse = await inletUtils.get(
    `/v0/workflows/${config.workflow.id}/mappingtargets`
  );
  const targets = targetsResponse.data.results;
  const target = targets.find(t => t.name === targetName);
  
  if (!target) {
    throw new Error(`Mapping target ${targetName} not found`);
  }

  const targetId = target.id;
  const data = {
    mapping_code: mappingCode,
  };

  const response = await inletUtils.patch(
    `/v0/workflows/${config.workflow.id}/mappingtargets/${targetId}`,
    data
  );

  if (response.status !== 200) {
    throw new Error(`Failed to update mapping ${targetName}: ${response.data}`);
  }
}
