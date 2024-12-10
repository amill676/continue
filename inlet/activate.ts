import * as vscode from "vscode";

import { InletMappingWebviewProvider } from "./InletMappingWebviewProvider";
import { InletInspectPanelWebviewProvider, } from "./InletInspectPanelWebviewProvider"
import * as inletUtils from "../core/inlet/utils"
import { exec } from "child_process";
import { VsCodeExtension } from "../extensions/vscode/src/extension/VsCodeExtension";
import { VsCodeIde } from "../extensions/vscode/src/VsCodeIde";
import { deterministicApplyLazyEdit } from "../core/edit/lazy/deterministic";
import { VerticalDiffCodeLensProvider } from "../extensions/vscode/src/lang-server/codeLens/providers/VerticalPerLineCodeLensProvider";

// Add this at the top of the file, outside any function
let mappingPanel: vscode.WebviewPanel | undefined;
let inspectPanel: vscode.WebviewPanel | undefined;

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
          await this.applyMapping(message.data.target, message.data.field, message.data.mapping)
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
    console.log("APPLYING MAPPING", target, field, mapping)
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
      const diffLines = await deterministicApplyLazyEdit(
        currentContent,
        newContent,
        filepath
      )

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

  // Register the CodeLens provider
  // SEAN TODO: uncomment this if the buttons disappear
  const verticalDiffManager = extension.verticalDiffManager;
  const codeLensProvider = new VerticalDiffCodeLensProvider(
    verticalDiffManager.filepathToCodeLens
  );
  // context.subscriptions.push(
  //   vscode.languages.registerCodeLensProvider(
  //       { scheme: 'file' },  // Or specific language types
  //       codeLensProvider
  //   )
  // );
  // Set up the refresh callback
  // verticalDiffManager.refreshCodeLens = () => {
  //     codeLensProvider.refresh();
  // };
  // Register the accept/reject commands
  vscode.commands.executeCommand('setContext', 'continue.hasVerticalDiffManager', true)

  // context.subscriptions.push(
  //   vscode.commands.registerCommand('continue.acceptVerticalDiffBlock', 
  //     async (filepath: string, index: number) => {
  //       console.log('Accepting vertical diff block:', {filepath, index});
  //       verticalDiffManager.acceptRejectVerticalDiffBlock(true, filepath, index)
  //     }
  //   ),
  //   vscode.commands.registerCommand('continue.rejectVerticalDiffBlock',
  //     async (filepath: string, index: number) => {
  //       console.log('Rejecting vertical diff block:', {filepath, index});
  //       verticalDiffManager.acceptRejectVerticalDiffBlock(false, filepath, index)
  //     }
  //   )
  // );
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
  let config = await inletUtils.getInletProjectConfig(inletExtension.extension.ide)
  config.workflow?.mappings.forEach(async mapping => {
    let path = mapping.path
    let fullPath = await inletUtils.getFullPath(inletExtension.extension.ide, path)
    let content = await inletExtension.extension.ide.readFile(fullPath)
    await updateMappingCode(config, mapping.name, content)
  })
}

async function updateMappingCode(config, targetName, mappingCode) {
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
