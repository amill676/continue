import ReactStore, { attach } from "@inlet/web/common/ReactStore"
import { InnerInspectPanel } from "@inlet/web/main/InspectPanel"
import { WorkflowEditStore } from "@inlet/web/main/WorkflowEditStore"

const store = new WorkflowEditStore()


// Listen for messages from the extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'setWorkflowId':
      console.log("Loading workflow", message.data);
      store.loadWorkflow(message.data);
      break;
  }
});

export const VSCodeInspectView = attach(
  store,
  InnerInspectPanel,
  {
    varSelectEnabled: 'varSelectEnabled',
    currentInspectedVariables: 'currentInspectedVariables',
    lastExecutionResult: 'lastExecutionResult',
    varSearchValues: 'varSearchValues',
    varSearchSuggestions: 'varSearchSuggestions',
    inspectPanelValues: 'inspectPanelValues',
    loadingVarValue: 'loadingVarValue',
  }, {
    onSearchVarSearchChange: store.handleChangeVarSearchValue.bind(store),
    lookupVariableValue: store.lookupVariableValue.bind(store),
    onStartVarSelect: store.handleStartVarSelect.bind(store),
  }
)