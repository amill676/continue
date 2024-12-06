
export default class IDEDelegate {
  private messageCounter = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }>();

  constructor() {
    window.addEventListener('message', message => {
      console.log("IDE Delegate got message", message)
      
      // Handle responses
      if (message.data.id && this.pendingRequests.has(message.data.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.data.id)!;
        this.pendingRequests.delete(message.data.id);
        
        if (message.data.error) {
          reject(message.data.error);
        } else {
          resolve(message.data.response);
        }
      }
    });
  }

  /**
   * Sends a message to the extension and waits for a response
   */
  private async sendRequest(command: string, data?: any): Promise {
    const id = ++this.messageCounter;
    
    return new Promise<T>((resolve, reject) => {
      // Store the promise callbacks
      this.pendingRequests.set(id, { resolve, reject });

      // Send the message
      vscode.postMessage({
        id,
        command,
        data
      });

      // Add timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${command} timed out`));
        }
      }, 5000);
    });
  }

  // Example usage
  async getTargetCode(targetName: string): Promise<string> {
    const response = await this.sendRequest('getTargetCode', { targetName });
    console.log("RESPONSE", response)
    return response.code;
  }

  async acceptDiff(targetName: string) {
    this.sendRequest('acceptDiff', { targetName });
  }
}
