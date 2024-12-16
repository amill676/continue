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
  }, {
    onRemapField: store.handleClickRemapField.bind(store),
    handleClickPreviewMapping: handleClickPreviewMapping,
    onClickAcceptMapping: handleClickAcceptMapping,
    onClickRejectMapping: handleClickRejectMapping,
    handleGetFieldSummary: store.handleGetFieldSummary.bind(store),
    isTargetFieldSummaryLoading: store.isTargetFieldSummaryLoading.bind(store),
    onSuggestionHover: store.handleSuggestionHover.bind(store),
    setFieldValue: store.handleChangeOutputFieldMapping.bind(store),
    saveFieldMappingState: store.saveFieldMappingState.bind(store),
  }
)


export const FieldSummaryPreview = attach(
  store,
  function InnerFieldSummaryPreview(props) {
    if (!props.targetPreviewData) {
      // hide if <TableDataPreview/> component is not being shown
      console.log('InnerFieldSummaryPreview() targetPreviewData is null, hiding')
      return null
    }
    let fieldSummary = props.targetFieldSummaries[props.hoveringOnFieldId]?.[props.hoveringOnPath]
    if (!fieldSummary) {
      // hide if summary for this field does not exist yet
      console.log('InnerFieldSummaryPreview() field summary does not exist yet, hiding')
      return null
    }
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        right: 320,
        width: 300,
        backgroundColor: 'white',
        zIndex: 100,
        padding: 10,
        border: '1px solid #ccc',
        height: '100%',
      }}>
        <DataPreview data={fieldSummary} autoExpand={true}/>
      </div>
    )
  },
  {
    targetPreviewData: 'targetPreviewData',
    targetFieldSummaries: 'targetFieldSummaries',
    hoveringOnFieldId: 'hoveringOnFieldId',
    hoveringOnPath: 'hoveringOnPath',
  }
)


function TargetTable(props) {
  return (
    <div style={{position: 'relative', overflow: 'auto'}}>
      <TableWrapper/>
      <TableDataPreview/>
      <FieldSummaryPreview/>
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