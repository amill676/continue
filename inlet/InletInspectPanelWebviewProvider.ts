import * as vscode from "vscode";

export class InletInspectPanelWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'continue.inletPanel';
  _webviewView?: vscode.WebviewView;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
  ) {

  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._webviewView = webviewView;
    webviewView.webview.html = this.getPanelHtml(
      this.extensionContext,
      webviewView,
    );
  }

  getPanelHtml(
    context: vscode.ExtensionContext,
    webviewView: vscode.WebviewView | vscode.WebviewPanel,
  ) {
    const inDevelopmentMode =
      context?.extensionMode === vscode.ExtensionMode.Development
    let scriptUri: string
    let styleMainUri: string
    if (!inDevelopmentMode) {
      scriptUri = webviewView.webview
        .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "gui/assets/index.js"))
        .toString();
      styleMainUri = webviewView.webview
        .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "gui/assets/index.css"))
        .toString();
    } else {
      scriptUri = "http://localhost:5173/src/inspect.tsx";
      styleMainUri = "http://localhost:5173/src/index.css";
    }


    // Needed to get scripts to run in the vscode panel
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "gui"),
        vscode.Uri.joinPath(context.extensionUri, "assets"),
      ],
      portMapping: [
        {
          webviewPort: 9999,
          extensionHostPort: 9999,
        }
      ]
    };


    return `
    <!DOCTYPE html>
    <html>
    <head>
        <script>const vscode = acquireVsCodeApi();</script>
    </head>
    <body>
      <div id="root"></div>

      <!-- Shit to get stuff to work with vite -->
      ${
        inDevelopmentMode
          ? `<script type="module">
        import RefreshRuntime from "http://localhost:5173/@react-refresh"
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
        </script>`
          : ""
      }

      <script>
        window.csrf_token = null
        window.utilsBaseUrl = 'http://localhost:9999'
        window.utilsAccountId = 'a7da3f5286b43467355d2bd4'
        window.utilsAuthToken = '1a93MLOi0xCkP5lEdAk2fL4isVfE3IdT'
      </script>
      <script type="module" src="${scriptUri}"></script>
    </body>
    </html>
    `
  }
}
