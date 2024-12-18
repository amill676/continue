import { MantineReactInnerTargetTable, TableDataPreview, DataPreview, GlobalTableStyles } from "@inlet/web/main/NewMappingView"
import { attach } from "@inlet/web/common/ReactStore"
import store, { WorkflowEditStore, _traverseTargetFields } from "@inlet/web/main/WorkflowEditStore"
import IDEDelegate from "./IDEDelegate"


declare const vscode: {
  postMessage: (message: any) => void;
};

const ideDelegate = new IDEDelegate()
store.setIDE(ideDelegate)


// Listen for messages from the extension
window.addEventListener('message', async event => {
  const message = event.data;
  switch (message.command) {
    case 'refreshMapping':
      console.log('WINDOW LEVEL store.state: ', store.state)
      if (store.state.fieldMappingState == null) {
        // refresh the workflow
        console.log('WINDOW LEVEL refreshing workflow')
        await store.loadWorkflow(store.state.workflowId);
      }
      console.log("REFRESHING MAPPING")
      // Update the UI with the new data
      store.refreshMapping();
      break;
    case 'setWorkflowId':
      store.loadWorkflow(message.data);
      break;
  }
});

function handleClickPreviewMapping(
    targetIndex: number, fieldIndex: number, mappingExpression: string, sourceId: string) {
  store.handleClickPreviewMapping(targetIndex, fieldIndex, mappingExpression, sourceId).then(mapping => {
    let target = store.state.fieldMappingState?.targets[targetIndex]
    let fields = _traverseTargetFields(target?.fields)
    let field = fields[fieldIndex]
    console.log("MAPPING", mapping)
    vscode.postMessage({
      command: 'applyMapping',
      data: { target, field, mapping }
    });
  })
}

function handleClickAcceptMapping(
    targetIndex: number, fieldIndex: number, mappingIndex: number) {
  store.handleClickAcceptMapping(targetIndex, fieldIndex, mappingIndex)
  let target = store.state.fieldMappingState?.targets[targetIndex]
  if (!target) {
    return
  }
  vscode.postMessage({
    command: 'acceptDiff',
    data: { targetName: target.name }
  });
}

function handleClickRejectMapping(
    targetIndex: number, fieldIndex: number, mappingIndex: number) {
  store.handleClickRejectMapping(targetIndex, fieldIndex, mappingIndex)
  let target = store.state.fieldMappingState?.targets[targetIndex]
  if (!target) {
    return
  }
  vscode.postMessage({
    command: 'rejectDiff',
    data: { targetName: target.name }
  });
}


const TableWrapper = attach(
  store,
  MantineReactInnerTargetTable,
  {
    fieldMappingState: 'fieldMappingState',
    fieldMappingStateUpdateIndex: 'fieldMappingStateUpdateIndex',
    activeTab: 'activeTab',
    showingAddInputFields: 'showingAddInputFields',
    showingAddOutputFields: 'showingAddOutputFields',
    applyMappingLoading: 'applyMappingLoading',
    showingMappingCopied: 'showingMappingCopied',
    showingMappingDialog: 'showingMappingDialog',
    mappingInputPanelWidth: 'mappingInputPanelWidth',
    workflowId: 'workflowId',
    stopMappingLoading: 'stopMappingLoading',
    savingFieldMappingState: 'savingFieldMappingState',
    clearingFields: 'clearingFields',
    currentArraySourceConfigFieldIndex: 'currentArraySourceConfigFieldIndex',
    currentTargetIndex: 'currentTargetIndex',
    activePreviewMappingData: 'activePreviewMappingData',
    activePreviewMapping: 'activePreviewMapping',
    generatingMappingCode: 'generatingMappingCode',
    sourceFieldSummaryLoading: 'sourceFieldSummaryLoading',
  }, {
    onRemapField: store.handleClickRemapField.bind(store),
    handleClickPreviewMapping: handleClickPreviewMapping,
    onClickAcceptMapping: handleClickAcceptMapping,
    onClickRejectMapping: handleClickRejectMapping,
    handleGetFieldSummary: store.handleGetFieldSummary.bind(store),
    onSuggestionHover: store.handleSuggestionHover.bind(store),
    setFieldValue: store.handleChangeOutputFieldMapping.bind(store),
    saveFieldMappingState: store.saveFieldMappingState.bind(store),
  }
)


function TargetTable(props) {
  return (
    <div style={{position: 'relative', overflow: 'auto'}}>
      <TableWrapper/>
      <TableDataPreview/>
      <GlobalTableStyles/>
    </div>
  )
}


function MappingPanel() {
  return (
    <>
      <h1>Inlet Mapping</h1>
      <TargetTable/>
    </>
  )

}



export { MappingPanel }