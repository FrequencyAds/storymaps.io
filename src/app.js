// Storymaps.io — AGPL-3.0 — see LICENCE for details
// Orchestrator — imports all modules, wires init(), owns dom + persistence + event listeners

import * as notepad from '/src/notepad.js';
import * as log from '/src/log.js';
import { generateId, el, CARD_COLORS, DEFAULT_CARD_COLORS, STATUS_OPTIONS, ZOOM_LEVELS } from '/src/constants.js';
import { state, init as stateInit, initState, hasContent, confirmOverwrite, pushUndo, undo, redo, updateUndoRedoButtons, createColumn, createStory, createSlice, createRefColumn, selection, clearSelection, partialMapEditState, DEFAULT_NOTES } from '/src/state.js';
import { serialize, deserialize } from '/src/serialization.js';
import * as navigation from '/src/navigation.js';
import * as presence from '/src/presence.js';
import * as lock from '/src/lock.js';
import * as yjs from '/src/yjs.js';
import * as ui from '/src/ui.js';
import * as renderMod from '/src/render.js';
import * as exportsMod from '/src/exports.js';
import * as importsMod from '/src/imports.js';
import * as asanaImportsMod from '/src/asana-imports.js';
import * as phabImportsMod from '/src/phabricator-imports.js';
import * as linearImportsMod from '/src/linear-imports.js';
import { exportToYaml, importFromYaml } from '/src/yaml.js';
import { exportToCsv, importFromCsv } from '/src/csv.js';
import { showAlert, showConfirm, showPrompt } from '/src/modals.js';
import * as tour from '/src/tour.js';

// =============================================================================
// DOM References
// =============================================================================

const dom = {
    logoLink: document.getElementById('logoLink'),
    storyMap: document.getElementById('storyMap'),
    boardName: document.getElementById('boardName'),
    newMapBtn: document.getElementById('newMapBtn'),
    copyExistingBtn: document.getElementById('copyExistingBtn'),
    importJsonMenuItem: document.getElementById('importJsonMenuItem'),
    importYamlMenuItem: document.getElementById('importYamlMenuItem'),
    importSubmenuTrigger: document.getElementById('importSubmenuTrigger'),
    importSubmenu: document.getElementById('importSubmenu'),
    exportBtn: document.getElementById('exportMap'),
    exportYamlBtn: document.getElementById('exportYamlBtn'),
    printBtn: document.getElementById('printMap'),
    menuBtn: document.getElementById('menuBtn'),
    mainMenu: document.getElementById('mainMenu'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    zoomReset: document.getElementById('zoomReset'),
    undoBtn: document.getElementById('undoBtn'),
    redoBtn: document.getElementById('redoBtn'),
    shareBtn: document.getElementById('shareBtn'),
    shareMenu: document.getElementById('shareMenu'),
    shareCopyLink: document.getElementById('shareCopyLink'),
    shareScreenshot: document.getElementById('shareScreenshot'),
    shareDownload: document.getElementById('shareDownload'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    welcomeNewBtn: document.getElementById('welcomeNewBtn'),
    welcomeTourBtn: document.getElementById('welcomeTourBtn'),
    tourMenuBtn: document.getElementById('tourMenuBtn'),
    welcomeCounter: document.getElementById('welcomeCounter'),
    activeMappers: document.getElementById('activeMappers'),
    storyMapWrapper: document.getElementById('storyMapWrapper'),
    samplesSubmenuTrigger: document.getElementById('samplesSubmenuTrigger'),
    samplesSubmenu: document.getElementById('samplesSubmenu'),
    exportSubmenuTrigger: document.getElementById('exportSubmenuTrigger'),
    exportSubmenu: document.getElementById('exportSubmenu'),
    zoomControls: document.getElementById('zoomControls'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    tutorialToast: document.getElementById('tutorialToast'),
    tutorialToastClose: document.getElementById('tutorialToastClose'),
    importModal: document.getElementById('importModal'),
    importModalClose: document.getElementById('importModalClose'),
    importJsonText: document.getElementById('importJsonText'),
    importJsonBtn: document.getElementById('importJsonBtn'),
    importDropzone: document.getElementById('importDropzone'),
    importFileInput: document.getElementById('importFileInput'),
    exportModal: document.getElementById('exportModal'),
    exportModalClose: document.getElementById('exportModalClose'),
    exportJsonText: document.getElementById('exportJsonText'),
    exportMinify: document.getElementById('exportMinify'),
    exportCopyBtn: document.getElementById('exportCopyBtn'),
    exportFilename: document.getElementById('exportFilename'),
    exportDownloadBtn: document.getElementById('exportDownloadBtn'),
    // YAML import modal
    importYamlModal: document.getElementById('importYamlModal'),
    importYamlModalClose: document.getElementById('importYamlModalClose'),
    importYamlText: document.getElementById('importYamlText'),
    importYamlBtn: document.getElementById('importYamlBtn'),
    importYamlDropzone: document.getElementById('importYamlDropzone'),
    importYamlFileInput: document.getElementById('importYamlFileInput'),
    importYamlValidationError: document.getElementById('importYamlValidationError'),
    // YAML export modal
    exportYamlModal: document.getElementById('exportYamlModal'),
    exportYamlModalClose: document.getElementById('exportYamlModalClose'),
    exportYamlText: document.getElementById('exportYamlText'),
    exportYamlCopyBtn: document.getElementById('exportYamlCopyBtn'),
    exportYamlFilename: document.getElementById('exportYamlFilename'),
    exportYamlDownloadBtn: document.getElementById('exportYamlDownloadBtn'),
    // CSV import
    importCsvMenuItem: document.getElementById('importCsvMenuItem'),
    importCsvModal: document.getElementById('importCsvModal'),
    importCsvModalClose: document.getElementById('importCsvModalClose'),
    importCsvText: document.getElementById('importCsvText'),
    importCsvBtn: document.getElementById('importCsvBtn'),
    importCsvDropzone: document.getElementById('importCsvDropzone'),
    importCsvFileInput: document.getElementById('importCsvFileInput'),
    importCsvValidationError: document.getElementById('importCsvValidationError'),
    // CSV export
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    exportCsvModal: document.getElementById('exportCsvModal'),
    exportCsvModalClose: document.getElementById('exportCsvModalClose'),
    exportCsvText: document.getElementById('exportCsvText'),
    exportCsvCopyBtn: document.getElementById('exportCsvCopyBtn'),
    exportCsvFilename: document.getElementById('exportCsvFilename'),
    exportCsvDownloadBtn: document.getElementById('exportCsvDownloadBtn'),
    // Jira export
    exportJiraBtn: document.getElementById('exportJiraBtn'),
    jiraExportModal: document.getElementById('jiraExportModal'),
    jiraExportModalClose: document.getElementById('jiraExportModalClose'),
    jiraProjectName: document.getElementById('jiraProjectName'),
    jiraProjectKey: document.getElementById('jiraProjectKey'),
    jiraProjectType: document.getElementById('jiraProjectType'),
    jiraExportSlices: document.getElementById('jiraExportSlices'),
    jiraExportEpics: document.getElementById('jiraExportEpics'),
    jiraExportCount: document.getElementById('jiraExportCount'),
    jiraExportCancel: document.getElementById('jiraExportCancel'),
    jiraExportDownload: document.getElementById('jiraExportDownload'),
    jiraStatusNone: document.getElementById('jiraStatusNone'),
    jiraStatusDone: document.getElementById('jiraStatusDone'),
    jiraStatusInProgress: document.getElementById('jiraStatusInProgress'),
    jiraStatusPlanned: document.getElementById('jiraStatusPlanned'),
    jiraFilterNone: document.getElementById('jiraFilterNone'),
    jiraFilterPlanned: document.getElementById('jiraFilterPlanned'),
    jiraFilterInProgress: document.getElementById('jiraFilterInProgress'),
    jiraFilterDone: document.getElementById('jiraFilterDone'),
    // Phabricator export
    exportPhabBtn: document.getElementById('exportPhabBtn'),
    phabExportModal: document.getElementById('phabExportModal'),
    phabExportModalClose: document.getElementById('phabExportModalClose'),
    phabExportTitle: document.getElementById('phabExportTitle'),
    phabStage1: document.getElementById('phabStage1'),
    phabStage2: document.getElementById('phabStage2'),
    phabExportSlices: document.getElementById('phabExportSlices'),
    phabExportEpics: document.getElementById('phabExportEpics'),
    phabExportCount: document.getElementById('phabExportCount'),
    phabFilterNone: document.getElementById('phabFilterNone'),
    phabFilterPlanned: document.getElementById('phabFilterPlanned'),
    phabFilterInProgress: document.getElementById('phabFilterInProgress'),
    phabFilterDone: document.getElementById('phabFilterDone'),
    phabExportCancel: document.getElementById('phabExportCancel'),
    phabExportNext: document.getElementById('phabExportNext'),
    phabExportBack: document.getElementById('phabExportBack'),
    phabExportDone: document.getElementById('phabExportDone'),
    phabInstanceUrl: document.getElementById('phabInstanceUrl'),
    phabApiToken: document.getElementById('phabApiToken'),
    phabTags: document.getElementById('phabTags'),
    phabImportFunction: document.getElementById('phabImportFunction'),
    phabImportCall: document.getElementById('phabImportCall'),
    phabCopyFunction: document.getElementById('phabCopyFunction'),
    phabCopyCall: document.getElementById('phabCopyCall'),
    // Jira API export
    jiraApiExportModal: document.getElementById('jiraApiExportModal'),
    jiraApiExportModalClose: document.getElementById('jiraApiExportModalClose'),
    jiraApiExportTitle: document.getElementById('jiraApiExportTitle'),
    jiraApiStage1: document.getElementById('jiraApiStage1'),
    jiraApiStage2: document.getElementById('jiraApiStage2'),
    jiraApiExportSlices: document.getElementById('jiraApiExportSlices'),
    jiraApiExportEpics: document.getElementById('jiraApiExportEpics'),
    jiraApiExportCount: document.getElementById('jiraApiExportCount'),
    jiraApiFilterNone: document.getElementById('jiraApiFilterNone'),
    jiraApiFilterPlanned: document.getElementById('jiraApiFilterPlanned'),
    jiraApiFilterInProgress: document.getElementById('jiraApiFilterInProgress'),
    jiraApiFilterDone: document.getElementById('jiraApiFilterDone'),
    jiraApiExportCancel: document.getElementById('jiraApiExportCancel'),
    jiraApiExportNext: document.getElementById('jiraApiExportNext'),
    jiraApiExportBack: document.getElementById('jiraApiExportBack'),
    jiraApiExportDone: document.getElementById('jiraApiExportDone'),
    jiraApiEmail: document.getElementById('jiraApiEmail'),
    jiraApiToken: document.getElementById('jiraApiToken'),
    jiraApiProjectKey: document.getElementById('jiraApiProjectKey'),
    jiraApiImportFunction: document.getElementById('jiraApiImportFunction'),
    jiraApiImportCall: document.getElementById('jiraApiImportCall'),
    jiraApiCopyFunction: document.getElementById('jiraApiCopyFunction'),
    jiraApiCopyCall: document.getElementById('jiraApiCopyCall'),
    // Asana export
    asanaExportModal: document.getElementById('asanaExportModal'),
    asanaExportModalClose: document.getElementById('asanaExportModalClose'),
    asanaExportTitle: document.getElementById('asanaExportTitle'),
    asanaStage1: document.getElementById('asanaStage1'),
    asanaStage2: document.getElementById('asanaStage2'),
    asanaExportSlices: document.getElementById('asanaExportSlices'),
    asanaExportEpics: document.getElementById('asanaExportEpics'),
    asanaExportCount: document.getElementById('asanaExportCount'),
    asanaFilterNone: document.getElementById('asanaFilterNone'),
    asanaFilterPlanned: document.getElementById('asanaFilterPlanned'),
    asanaFilterInProgress: document.getElementById('asanaFilterInProgress'),
    asanaFilterDone: document.getElementById('asanaFilterDone'),
    asanaExportCancel: document.getElementById('asanaExportCancel'),
    asanaExportNext: document.getElementById('asanaExportNext'),
    asanaExportBack: document.getElementById('asanaExportBack'),
    asanaExportDone: document.getElementById('asanaExportDone'),
    asanaApiToken: document.getElementById('asanaApiToken'),
    asanaProjectUrl: document.getElementById('asanaProjectUrl'),
    asanaImportFunction: document.getElementById('asanaImportFunction'),
    asanaImportCall: document.getElementById('asanaImportCall'),
    asanaCreateSections: document.getElementById('asanaCreateSections'),
    asanaCopyFunction: document.getElementById('asanaCopyFunction'),
    asanaCopyCall: document.getElementById('asanaCopyCall'),
    // Asana CSV export
    exportAsanaCsvBtn: document.getElementById('exportAsanaCsvBtn'),
    asanaCsvExportModal: document.getElementById('asanaCsvExportModal'),
    asanaCsvExportModalClose: document.getElementById('asanaCsvExportModalClose'),
    asanaCsvExportSlices: document.getElementById('asanaCsvExportSlices'),
    asanaCsvExportEpics: document.getElementById('asanaCsvExportEpics'),
    asanaCsvExportCount: document.getElementById('asanaCsvExportCount'),
    asanaCsvFilterNone: document.getElementById('asanaCsvFilterNone'),
    asanaCsvFilterPlanned: document.getElementById('asanaCsvFilterPlanned'),
    asanaCsvFilterInProgress: document.getElementById('asanaCsvFilterInProgress'),
    asanaCsvFilterDone: document.getElementById('asanaCsvFilterDone'),
    asanaCsvCreateSections: document.getElementById('asanaCsvCreateSections'),
    asanaCsvExportCancel: document.getElementById('asanaCsvExportCancel'),
    asanaCsvExportDownload: document.getElementById('asanaCsvExportDownload'),
    // Jira Proxy export
    exportJiraProxyBtn: document.getElementById('exportJiraProxyBtn'),
    jiraProxyExportModal: document.getElementById('jiraProxyExportModal'),
    jiraProxyExportModalClose: document.getElementById('jiraProxyExportModalClose'),
    jiraProxyExportTitle: document.getElementById('jiraProxyExportTitle'),
    jiraProxyStage1: document.getElementById('jiraProxyStage1'),
    jiraProxyStage2: document.getElementById('jiraProxyStage2'),
    jiraProxyExportSlices: document.getElementById('jiraProxyExportSlices'),
    jiraProxyExportEpics: document.getElementById('jiraProxyExportEpics'),
    jiraProxyExportCount: document.getElementById('jiraProxyExportCount'),
    jiraProxyFilterNone: document.getElementById('jiraProxyFilterNone'),
    jiraProxyFilterPlanned: document.getElementById('jiraProxyFilterPlanned'),
    jiraProxyFilterInProgress: document.getElementById('jiraProxyFilterInProgress'),
    jiraProxyFilterDone: document.getElementById('jiraProxyFilterDone'),
    jiraProxyExportCancel: document.getElementById('jiraProxyExportCancel'),
    jiraProxyExportNext: document.getElementById('jiraProxyExportNext'),
    jiraProxyExportBack: document.getElementById('jiraProxyExportBack'),
    jiraProxyExportRun: document.getElementById('jiraProxyExportRun'),
    jiraProxyInstanceUrl: document.getElementById('jiraProxyInstanceUrl'),
    jiraProxyEmail: document.getElementById('jiraProxyEmail'),
    jiraProxyToken: document.getElementById('jiraProxyToken'),
    jiraProxyProjectKey: document.getElementById('jiraProxyProjectKey'),
    jiraProxyProgress: document.getElementById('jiraProxyProgress'),
    jiraProxyProgressBar: document.getElementById('jiraProxyProgressBar'),
    jiraProxyProgressItems: document.getElementById('jiraProxyProgressItems'),
    jiraProxyProgressSummary: document.getElementById('jiraProxyProgressSummary'),
    jiraProxySummary: document.getElementById('jiraProxySummary'),
    jiraProxyVerifyBtn: document.getElementById('jiraProxyVerifyBtn'),
    jiraProxyVerifyStatus: document.getElementById('jiraProxyVerifyStatus'),
    // Phabricator Proxy export
    exportPhabProxyBtn: document.getElementById('exportPhabProxyBtn'),
    phabProxyExportModal: document.getElementById('phabProxyExportModal'),
    phabProxyExportModalClose: document.getElementById('phabProxyExportModalClose'),
    phabProxyExportTitle: document.getElementById('phabProxyExportTitle'),
    phabProxyStage1: document.getElementById('phabProxyStage1'),
    phabProxyStage2: document.getElementById('phabProxyStage2'),
    phabProxyExportSlices: document.getElementById('phabProxyExportSlices'),
    phabProxyExportEpics: document.getElementById('phabProxyExportEpics'),
    phabProxyExportCount: document.getElementById('phabProxyExportCount'),
    phabProxyFilterNone: document.getElementById('phabProxyFilterNone'),
    phabProxyFilterPlanned: document.getElementById('phabProxyFilterPlanned'),
    phabProxyFilterInProgress: document.getElementById('phabProxyFilterInProgress'),
    phabProxyFilterDone: document.getElementById('phabProxyFilterDone'),
    phabProxyExportCancel: document.getElementById('phabProxyExportCancel'),
    phabProxyExportNext: document.getElementById('phabProxyExportNext'),
    phabProxyExportBack: document.getElementById('phabProxyExportBack'),
    phabProxyExportRun: document.getElementById('phabProxyExportRun'),
    phabProxyInstanceUrl: document.getElementById('phabProxyInstanceUrl'),
    phabProxyWikimediaWarning: document.getElementById('phabProxyWikimediaWarning'),
    phabProxyApiToken: document.getElementById('phabProxyApiToken'),
    phabProxyTags: document.getElementById('phabProxyTags'),
    phabProxyProgress: document.getElementById('phabProxyProgress'),
    phabProxyProgressBar: document.getElementById('phabProxyProgressBar'),
    phabProxyProgressItems: document.getElementById('phabProxyProgressItems'),
    phabProxyProgressSummary: document.getElementById('phabProxyProgressSummary'),
    phabProxySummary: document.getElementById('phabProxySummary'),
    phabProxyVerifyBtn: document.getElementById('phabProxyVerifyBtn'),
    phabProxyVerifyStatus: document.getElementById('phabProxyVerifyStatus'),
    // Asana Proxy export
    exportAsanaProxyBtn: document.getElementById('exportAsanaProxyBtn'),
    asanaProxyExportModal: document.getElementById('asanaProxyExportModal'),
    asanaProxyExportModalClose: document.getElementById('asanaProxyExportModalClose'),
    asanaProxyExportTitle: document.getElementById('asanaProxyExportTitle'),
    asanaProxyStage1: document.getElementById('asanaProxyStage1'),
    asanaProxyStage2: document.getElementById('asanaProxyStage2'),
    asanaProxyExportSlices: document.getElementById('asanaProxyExportSlices'),
    asanaProxyExportEpics: document.getElementById('asanaProxyExportEpics'),
    asanaProxyExportCount: document.getElementById('asanaProxyExportCount'),
    asanaProxyFilterNone: document.getElementById('asanaProxyFilterNone'),
    asanaProxyFilterPlanned: document.getElementById('asanaProxyFilterPlanned'),
    asanaProxyFilterInProgress: document.getElementById('asanaProxyFilterInProgress'),
    asanaProxyFilterDone: document.getElementById('asanaProxyFilterDone'),
    asanaProxyExportCancel: document.getElementById('asanaProxyExportCancel'),
    asanaProxyExportNext: document.getElementById('asanaProxyExportNext'),
    asanaProxyExportBack: document.getElementById('asanaProxyExportBack'),
    asanaProxyExportRun: document.getElementById('asanaProxyExportRun'),
    asanaProxyApiToken: document.getElementById('asanaProxyApiToken'),
    asanaProxyProjectUrl: document.getElementById('asanaProxyProjectUrl'),
    asanaProxyCreateSections: document.getElementById('asanaProxyCreateSections'),
    asanaProxyProgress: document.getElementById('asanaProxyProgress'),
    asanaProxyProgressBar: document.getElementById('asanaProxyProgressBar'),
    asanaProxyProgressItems: document.getElementById('asanaProxyProgressItems'),
    asanaProxyProgressSummary: document.getElementById('asanaProxyProgressSummary'),
    asanaProxySummary: document.getElementById('asanaProxySummary'),
    asanaProxyVerifyBtn: document.getElementById('asanaProxyVerifyBtn'),
    asanaProxyVerifyStatus: document.getElementById('asanaProxyVerifyStatus'),
    // Linear Proxy export
    exportLinearProxyBtn: document.getElementById('exportLinearProxyBtn'),
    linearProxyExportModal: document.getElementById('linearProxyExportModal'),
    linearProxyExportModalClose: document.getElementById('linearProxyExportModalClose'),
    linearProxyExportTitle: document.getElementById('linearProxyExportTitle'),
    linearProxyStage1: document.getElementById('linearProxyStage1'),
    linearProxyStage2: document.getElementById('linearProxyStage2'),
    linearProxyExportSlices: document.getElementById('linearProxyExportSlices'),
    linearProxyExportEpics: document.getElementById('linearProxyExportEpics'),
    linearProxyExportCount: document.getElementById('linearProxyExportCount'),
    linearProxyFilterNone: document.getElementById('linearProxyFilterNone'),
    linearProxyFilterPlanned: document.getElementById('linearProxyFilterPlanned'),
    linearProxyFilterInProgress: document.getElementById('linearProxyFilterInProgress'),
    linearProxyFilterDone: document.getElementById('linearProxyFilterDone'),
    linearProxyExportCancel: document.getElementById('linearProxyExportCancel'),
    linearProxyExportNext: document.getElementById('linearProxyExportNext'),
    linearProxyExportBack: document.getElementById('linearProxyExportBack'),
    linearProxyExportRun: document.getElementById('linearProxyExportRun'),
    linearProxyApiKey: document.getElementById('linearProxyApiKey'),
    linearProxyTeamKey: document.getElementById('linearProxyTeamKey'),
    linearProxyProgress: document.getElementById('linearProxyProgress'),
    linearProxyProgressBar: document.getElementById('linearProxyProgressBar'),
    linearProxyProgressItems: document.getElementById('linearProxyProgressItems'),
    linearProxyProgressSummary: document.getElementById('linearProxyProgressSummary'),
    linearProxySummary: document.getElementById('linearProxySummary'),
    linearProxyVerifyBtn: document.getElementById('linearProxyVerifyBtn'),
    linearProxyVerifyStatus: document.getElementById('linearProxyVerifyStatus'),
    // Jira Import
    importJiraBtn: document.getElementById('importJiraBtn'),
    jiraImportModal: document.getElementById('jiraImportModal'),
    jiraImportModalClose: document.getElementById('jiraImportModalClose'),
    jiraImportTitle: document.getElementById('jiraImportTitle'),
    jiraImportStage1: document.getElementById('jiraImportStage1'),
    jiraImportStage2: document.getElementById('jiraImportStage2'),
    jiraImportInstanceUrl: document.getElementById('jiraImportInstanceUrl'),
    jiraImportProjectKey: document.getElementById('jiraImportProjectKey'),
    jiraImportEmail: document.getElementById('jiraImportEmail'),
    jiraImportToken: document.getElementById('jiraImportToken'),
    jiraImportVerifyBtn: document.getElementById('jiraImportVerifyBtn'),
    jiraImportVerifyStatus: document.getElementById('jiraImportVerifyStatus'),
    jiraImportProgress: document.getElementById('jiraImportProgress'),
    jiraImportProgressBar: document.getElementById('jiraImportProgressBar'),
    jiraImportProgressItems: document.getElementById('jiraImportProgressItems'),
    jiraImportFetchBtn: document.getElementById('jiraImportFetchBtn'),
    jiraImportCancel: document.getElementById('jiraImportCancel'),
    jiraImportBack: document.getElementById('jiraImportBack'),
    jiraImportPreviewHeader: document.getElementById('jiraImportPreviewHeader'),
    jiraImportPreview: document.getElementById('jiraImportPreview'),
    jiraImportCount: document.getElementById('jiraImportCount'),
    jiraImportConfirmBtn: document.getElementById('jiraImportConfirmBtn'),
    // Jira CSV Import
    importJiraCsvBtn: document.getElementById('importJiraCsvBtn'),
    jiraCsvImportStage1: document.getElementById('jiraCsvImportStage1'),
    jiraCsvDropzone: document.getElementById('jiraCsvDropzone'),
    jiraCsvFileInput: document.getElementById('jiraCsvFileInput'),
    jiraCsvValidationError: document.getElementById('jiraCsvValidationError'),
    jiraCsvInstanceUrl: document.getElementById('jiraCsvInstanceUrl'),
    jiraCsvImportCancel: document.getElementById('jiraCsvImportCancel'),
    jiraCsvImportParseBtn: document.getElementById('jiraCsvImportParseBtn'),
    // Asana Import
    importAsanaBtn: document.getElementById('importAsanaBtn'),
    asanaImportModal: document.getElementById('asanaImportModal'),
    asanaImportModalClose: document.getElementById('asanaImportModalClose'),
    asanaImportTitle: document.getElementById('asanaImportTitle'),
    asanaImportStage1: document.getElementById('asanaImportStage1'),
    asanaImportStage2: document.getElementById('asanaImportStage2'),
    asanaImportToken: document.getElementById('asanaImportToken'),
    asanaImportProjectUrl: document.getElementById('asanaImportProjectUrl'),
    asanaImportVerifyBtn: document.getElementById('asanaImportVerifyBtn'),
    asanaImportVerifyStatus: document.getElementById('asanaImportVerifyStatus'),
    asanaImportProgress: document.getElementById('asanaImportProgress'),
    asanaImportProgressBar: document.getElementById('asanaImportProgressBar'),
    asanaImportProgressItems: document.getElementById('asanaImportProgressItems'),
    asanaImportFetchBtn: document.getElementById('asanaImportFetchBtn'),
    asanaImportCancel: document.getElementById('asanaImportCancel'),
    asanaImportBack: document.getElementById('asanaImportBack'),
    asanaImportPreviewHeader: document.getElementById('asanaImportPreviewHeader'),
    asanaImportPreview: document.getElementById('asanaImportPreview'),
    asanaImportCount: document.getElementById('asanaImportCount'),
    asanaImportConfirmBtn: document.getElementById('asanaImportConfirmBtn'),
    asanaImportMappingMode: document.getElementById('asanaImportMappingMode'),
    // Asana CSV Import
    importAsanaCsvBtn: document.getElementById('importAsanaCsvBtn'),
    asanaCsvImportStage1: document.getElementById('asanaCsvImportStage1'),
    asanaCsvDropzone: document.getElementById('asanaCsvDropzone'),
    asanaCsvFileInput: document.getElementById('asanaCsvFileInput'),
    asanaCsvValidationError: document.getElementById('asanaCsvValidationError'),
    asanaCsvImportCancel: document.getElementById('asanaCsvImportCancel'),
    asanaCsvImportParseBtn: document.getElementById('asanaCsvImportParseBtn'),
    // Phabricator CSV Import
    importPhabCsvBtn: document.getElementById('importPhabCsvBtn'),
    phabImportModal: document.getElementById('phabImportModal'),
    phabImportModalClose: document.getElementById('phabImportModalClose'),
    phabImportTitle: document.getElementById('phabImportTitle'),
    phabCsvImportStage1: document.getElementById('phabCsvImportStage1'),
    phabCsvDropzone: document.getElementById('phabCsvDropzone'),
    phabCsvFileInput: document.getElementById('phabCsvFileInput'),
    phabCsvValidationError: document.getElementById('phabCsvValidationError'),
    phabCsvImportCancel: document.getElementById('phabCsvImportCancel'),
    phabCsvImportParseBtn: document.getElementById('phabCsvImportParseBtn'),
    phabImportStage2: document.getElementById('phabImportStage2'),
    phabImportPreviewHeader: document.getElementById('phabImportPreviewHeader'),
    phabImportPreview: document.getElementById('phabImportPreview'),
    phabImportBack: document.getElementById('phabImportBack'),
    phabImportCount: document.getElementById('phabImportCount'),
    phabImportConfirmBtn: document.getElementById('phabImportConfirmBtn'),
    // Linear Import
    importLinearBtn: document.getElementById('importLinearBtn'),
    linearImportModal: document.getElementById('linearImportModal'),
    linearImportModalClose: document.getElementById('linearImportModalClose'),
    linearImportTitle: document.getElementById('linearImportTitle'),
    linearImportStage1: document.getElementById('linearImportStage1'),
    linearImportStage2: document.getElementById('linearImportStage2'),
    linearImportApiKey: document.getElementById('linearImportApiKey'),
    linearImportTeamKey: document.getElementById('linearImportTeamKey'),
    linearImportVerifyBtn: document.getElementById('linearImportVerifyBtn'),
    linearImportVerifyStatus: document.getElementById('linearImportVerifyStatus'),
    linearImportProgress: document.getElementById('linearImportProgress'),
    linearImportProgressBar: document.getElementById('linearImportProgressBar'),
    linearImportProgressItems: document.getElementById('linearImportProgressItems'),
    linearImportFetchBtn: document.getElementById('linearImportFetchBtn'),
    linearImportCancel: document.getElementById('linearImportCancel'),
    linearImportBack: document.getElementById('linearImportBack'),
    linearImportPreviewHeader: document.getElementById('linearImportPreviewHeader'),
    linearImportPreview: document.getElementById('linearImportPreview'),
    linearImportCount: document.getElementById('linearImportCount'),
    linearImportConfirmBtn: document.getElementById('linearImportConfirmBtn'),
    linearImportMappingMode: document.getElementById('linearImportMappingMode'),
    // Linear CSV Import
    importLinearCsvBtn: document.getElementById('importLinearCsvBtn'),
    linearCsvImportStage1: document.getElementById('linearCsvImportStage1'),
    linearCsvDropzone: document.getElementById('linearCsvDropzone'),
    linearCsvFileInput: document.getElementById('linearCsvFileInput'),
    linearCsvValidationError: document.getElementById('linearCsvValidationError'),
    linearCsvImportCancel: document.getElementById('linearCsvImportCancel'),
    linearCsvImportParseBtn: document.getElementById('linearCsvImportParseBtn'),
    // View toggles
    toggleCursorsBtn: document.getElementById('toggleCursorsBtn'),
    toggleFocusModeBtn: document.getElementById('toggleFocusModeBtn'),
    toggleFullscreenBtn: document.getElementById('toggleFullscreenBtn'),
    toggleDarkModeBtn: document.getElementById('toggleDarkModeBtn'),
    // Lock feature
    lockMapBtn: document.getElementById('lockMapBtn'),
    relockBtn: document.getElementById('relockBtn'),
    updatePasswordBtn: document.getElementById('updatePasswordBtn'),
    removeLockBtn: document.getElementById('removeLockBtn'),
    lockDivider: document.getElementById('lockDivider'),
    lockModal: document.getElementById('lockModal'),
    lockModalTitle: document.getElementById('lockModalTitle'),
    lockModalDescription: document.getElementById('lockModalDescription'),
    lockModalClose: document.getElementById('lockModalClose'),
    lockPasswordInput: document.getElementById('lockPasswordInput'),
    lockModalCancel: document.getElementById('lockModalCancel'),
    lockModalConfirm: document.getElementById('lockModalConfirm'),
    readOnlyBanner: document.getElementById('readOnlyBanner'),
    legendPanel: document.getElementById('legendPanel'),
    legendToggle: document.getElementById('legendToggle'),
    legendBody: document.getElementById('legendBody'),
    legendEntries: document.getElementById('legendEntries'),
    legendAddBtn: document.getElementById('legendAddBtn'),
    controlsRight: document.getElementById('controlsRight'),
    panelBody: document.getElementById('panelBody'),
    notesToggle: document.getElementById('notesToggle'),
    // Partials
    partialsPanel: document.getElementById('partialsPanel'),
    partialsToggle: document.getElementById('partialsToggle'),
    partialsBody: document.getElementById('partialsBody'),
    partialsList: document.getElementById('partialsList'),
    // Log
    logToggle: document.getElementById('logToggle'),
    logPanel: document.getElementById('logPanel'),
    // Backups
    backupsBtn: document.getElementById('backupsBtn'),
    backupsModal: document.getElementById('backupsModal'),
    backupsModalClose: document.getElementById('backupsModalClose'),
    backupsList: document.getElementById('backupsList'),
    createBackupBtn: document.getElementById('createBackupBtn'),
    backupCountBadge: document.getElementById('backupCountBadge'),
    appToast: document.getElementById('appToast'),
    // Card expand modal
    cardExpandModal: document.getElementById('cardExpandModal'),
    cardExpandName: document.getElementById('cardExpandName'),
    cardExpandBody: document.getElementById('cardExpandBody'),
    // Search
    searchBtn: document.getElementById('searchBtn'),
    searchBar: document.getElementById('searchBar'),
    searchInput: document.getElementById('searchInput'),
    searchClose: document.getElementById('searchClose'),
    // Filter
    searchFilterBtn: document.getElementById('searchFilterBtn'),
    filterCount: document.getElementById('filterCount'),
    filterPanel: document.getElementById('filterPanel'),
    filterStatusList: document.getElementById('filterStatusList'),
    filterColorList: document.getElementById('filterColorList'),
    filterTagsList: document.getElementById('filterTagsList'),
    filterClearBtn: document.getElementById('filterClearBtn'),
    filterDoneBtn: document.getElementById('filterDoneBtn'),
};

const { isMapEditable } = lock;
const { render, initSortable, addColumn, addColumnAt, addStory, addSlice, deleteColumn, deleteStory, deleteSlice, handleColumnSelection, updateSelectionUI, duplicateColumns, duplicateCards, deleteSelectedColumns, deleteSelectedCards } = renderMod;
const { closeMainMenu, closeAllOptionsMenus, zoomToFit, scrollElementIntoView } = navigation;
const { loadYjs, createYjsDoc, destroyYjs, syncFromYjs, syncToYjs, getProvider, getYdoc, getYmap, ensureSortable } = yjs;
const { trackPresence, clearPresence, trackCursor, clearCursors, toggleCursorsVisibility, updateCursorsVisibilityUI, getCursorColor, getSessionId, broadcastDragStart, broadcastDragEnd } = presence;
const { lockState, loadLockState, subscribeLockState, clearLockSubscription, updateLockUI, updateEditability, checkSessionUnlock, initLockListeners, hideLockModal } = lock;
const { renderLegend, getAllTagsInMap, renderPartialsList } = ui;

// =============================================================================
// Persistence
// =============================================================================

const STORAGE_KEY = 'storymap';

// Generate a unique map ID, checking server-side SQLite for collisions
const newMapId = async () => {
    try {
        const res = await fetch('/api/maps/new-id');
        if (res.ok) return (await res.json()).id;
    } catch { /* fall through */ }
    return generateId();
};

// Subscribe to real-time updates via Yjs
const subscribeToMap = async (mapId) => {
    if (!getYdoc()) {
        await createYjsDoc(mapId);
    }

    syncFromYjs();
    render();

    const deferredTracking = async () => {
        await trackPresence();
        trackCursor();
        await loadLockState(mapId);
        lockState.sessionUnlocked = checkSessionUnlock(mapId);
        subscribeLockState(mapId);
        updateLockUI();
        updateEditability();
        // Fetch backup count for menu badge
        fetch(`/api/backups/${mapId}`).then(r => r.json()).then(b => updateBackupBadge(b.length)).catch(() => {});

        const provider = getProvider();
        if (provider) {
            provider.awareness.on('change', () => {
                const ydoc = getYdoc();
                for (const [clientId, awarenessState] of provider.awareness.getStates()) {
                    if (clientId === ydoc.clientID) continue;
                    if (awarenessState.lock) {
                        loadLockState(mapId).then(() => {
                            lockState.sessionUnlocked = checkSessionUnlock(mapId);
                            updateLockUI();
                            updateEditability();
                        });
                        break;
                    }
                }
            });
        }
    };
    if ('requestIdleCallback' in window) {
        requestIdleCallback(deferredTracking);
    } else {
        setTimeout(deferredTracking, 0);
    }
};

// Local storage save (also syncs to Yjs → WebSocket → server)
const saveToStorage = () => {
    if (state.mapId && !isMapEditable()) {
        return;
    }

    // Don't overwrite localStorage that has real data with an empty state
    // (protects against Yjs sync returning partial data e.g. notes only)
    if (state.columns.length === 0) {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing) {
            try {
                const parsed = JSON.parse(existing);
                if (parsed.steps && parsed.steps.length > 0) return;
            } catch { /* corrupted — ok to overwrite */ }
        }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
    if (state.mapId) localStorage.setItem(STORAGE_KEY + ':mapId', state.mapId);
    if (state.mapId && getYmap()) {
        syncToYjs();
    }
};

// Combined render and save - used after state mutations
const renderAndSave = () => {
    ensurePartialBlankCol();
    render();
    saveToStorage();
    if (dom.searchInput.value.trim() || hasActiveFilters()) {
        applySearchFilter(dom.searchInput.value.trim());
    }
};

// =============================================================================
// Card Expand Modal
// =============================================================================

let _expandedItem = null;

const openExpandModal = (item, { readOnly = false } = {}) => {
    // If a previous close is still waiting for its popstate, absorb it now
    if (_poppingExpandState) {
        _poppingExpandState = false;
    }
    _expandedItem = item;
    const editable = !readOnly && isMapEditable();
    dom.cardExpandName.value = item.name || '';
    dom.cardExpandBody.value = item.body || '';
    dom.cardExpandName.readOnly = !editable;
    dom.cardExpandBody.readOnly = !editable;
    const modal = dom.cardExpandModal.querySelector('.card-expand-modal');
    if (modal) modal.style.backgroundColor = item.color || '';
    dom.cardExpandModal.classList.add('visible');
    requestAnimationFrame(autoResizeExpandName);
    if (editable) {
        dom.cardExpandName.focus();
        pushUndo();
    }
    history.pushState({ cardExpand: true }, '');
};

let _closingExpandViaBack = false;
let _poppingExpandState = false;

const closeExpandModal = () => {
    if (!dom.cardExpandModal.classList.contains('visible')) return;
    dom.cardExpandModal.classList.remove('visible');
    _expandedItem = null;
    renderAndSave();
    // Pop the history entry we pushed on open, unless we got here via back button
    if (!_closingExpandViaBack) {
        _poppingExpandState = true;
        history.back();
    }
};

const autoResizeExpandName = () => {
    dom.cardExpandName.style.height = 'auto';
    dom.cardExpandName.style.height = dom.cardExpandName.scrollHeight + 'px';
};

dom.cardExpandName.addEventListener('input', () => {
    if (!_expandedItem) return;
    _expandedItem.name = dom.cardExpandName.value;
    log.logTextEdit('card title', _expandedItem.id);
    autoResizeExpandName();
    saveToStorage();
});

dom.cardExpandBody.addEventListener('input', () => {
    if (!_expandedItem) return;
    _expandedItem.body = dom.cardExpandBody.value;
    log.logTextEdit('card body', _expandedItem.id);
    saveToStorage();
});

document.getElementById('cardExpandModalClose')?.addEventListener('click', closeExpandModal);
dom.cardExpandModal.addEventListener('click', (e) => {
    if (e.target === dom.cardExpandModal) closeExpandModal();
});

const loadFromStorage = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            deserialize(JSON.parse(data));
            return true;
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    return false;
};

// =============================================================================
// Import / Export
// =============================================================================

const exportMap = () => {
    if (dom.welcomeScreen.classList.contains('visible')) return;
    saveToStorage();
    showExportModal();
};

const importBackupsIfPresent = async (data) => {
    if (!state.mapId || !Array.isArray(data?.backups) || !data.backups.length) return;
    // Send backups one at a time to stay under the 1MB body limit
    for (const backup of data.backups) {
        try {
            await fetch(`/api/backups/${state.mapId}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backups: [backup] }),
            });
        } catch { /* best-effort */ }
    }
};

const createAutoBackup = async (note) => {
    if (!state.mapId) return;
    try {
        await fetch(`/api/backups/${state.mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
    } catch { /* best-effort */ }
};

const importMap = async (file) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (isFromWelcome) {
                hideWelcomeScreen();
                initState();
                const mapId = await newMapId();
                state.mapId = mapId;
                history.replaceState({ mapId }, '', `/${mapId}`);
                await createYjsDoc(mapId);
            } else {
                await createAutoBackup('Auto: before import');
                pushUndo();
            }
            deserialize(parsed);
            dom.boardName.value = state.name;
            renderAndSave();
            requestAnimationFrame(zoomToFit);
            if (isFromWelcome) {
                subscribeToMap(state.mapId);
            }
            importBackupsIfPresent(parsed);
        } catch {
            await showAlert('Failed to import: Invalid file format');
        }
    };
    reader.readAsText(file);
};

const showImportModal = () => {
    dom.importModal.classList.add('visible');
    dom.importJsonText.value = '';
    dom.importJsonText.focus();
};

const hideImportModal = () => {
    dom.importModal.classList.remove('visible');
    dom.importJsonText.value = '';
};

const importFromJsonText = async (jsonText) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    try {
        const data = JSON.parse(jsonText);
        if (isFromWelcome) {
            hideWelcomeScreen();
            initState();
            const mapId = await newMapId();
            state.mapId = mapId;
            history.replaceState({ mapId }, '', `/${mapId}`);
            await createYjsDoc(mapId);
        } else {
            await createAutoBackup('Auto: before import');
            pushUndo();
        }
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        requestAnimationFrame(zoomToFit);
        hideImportModal();
        if (isFromWelcome) {
            subscribeToMap(state.mapId);
        }
        importBackupsIfPresent(data);
    } catch {
        await showAlert('Failed to import: Invalid JSON format');
    }
};

// YAML Import
const showImportYamlModal = () => {
    dom.importYamlModal.classList.add('visible');
    dom.importYamlText.value = '';
    dom.importYamlValidationError.classList.add('hidden');
    dom.importYamlText.focus();
};

const hideImportYamlModal = () => {
    dom.importYamlModal.classList.remove('visible');
    dom.importYamlText.value = '';
};

const importFromYamlText = async (yamlText) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    dom.importYamlValidationError.classList.add('hidden');

    let data;
    try {
        data = importFromYaml(yamlText);
    } catch (err) {
        if (err.validationErrors) {
            dom.importYamlValidationError.textContent = err.validationErrors.join('\n');
            dom.importYamlValidationError.classList.remove('hidden');
        } else {
            await showAlert('Failed to import: Invalid YAML format');
        }
        return;
    }

    try {
        if (isFromWelcome) {
            hideWelcomeScreen();
            initState();
            const mapId = await newMapId();
            state.mapId = mapId;
            history.replaceState({ mapId }, '', `/${mapId}`);
            await createYjsDoc(mapId);
        } else {
            await createAutoBackup('Auto: before import');
            pushUndo();
        }
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        requestAnimationFrame(zoomToFit);
        hideImportYamlModal();
        if (isFromWelcome) {
            subscribeToMap(state.mapId);
        }
        importBackupsIfPresent(data);
    } catch {
        await showAlert('Failed to import: Invalid data structure');
    }
};

const importYamlFile = async (file) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = importFromYaml(e.target.result);
            if (isFromWelcome) {
                hideWelcomeScreen();
                initState();
                const mapId = await newMapId();
                state.mapId = mapId;
                history.replaceState({ mapId }, '', `/${mapId}`);
                await createYjsDoc(mapId);
            } else {
                await createAutoBackup('Auto: before import');
                pushUndo();
            }
            deserialize(data);
            dom.boardName.value = state.name;
            renderAndSave();
            requestAnimationFrame(zoomToFit);
            if (isFromWelcome) {
                subscribeToMap(state.mapId);
            }
            importBackupsIfPresent(data);
        } catch (err) {
            const msg = err.validationErrors ? err.validationErrors.join('\n') : 'Invalid YAML format';
            await showAlert('Failed to import: ' + msg);
        }
    };
    reader.readAsText(file);
};

let _exportBackups = null;

const updateExportJson = () => {
    const minify = dom.exportMinify.checked;
    const data = serialize();
    if (_exportBackups?.length) data.backups = _exportBackups;
    const json = minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);
    dom.exportJsonText.value = json;
};

const sanitizeFilename = (name) => {
    return name
        .toLowerCase()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
        .replace(/^\.+/, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 200)
        || 'story-map';
};
const formatTimestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
};
exportsMod.init({ dom, sanitizeFilename });
const {
    showJiraExportModal, hideJiraExportModal, confirmCloseJiraExportModal, populateJiraExportEpics, downloadJiraCsv, jiraExportState,
    showPhabExportModal, hidePhabExportModal, confirmClosePhabModal, populatePhabExportEpics, showPhabStage2, showPhabStage1,
    generatePhabImportFunction, generatePhabImportCall, copyPhabCode, phabExportState,
    showJiraApiExportModal, hideJiraApiExportModal, confirmCloseJiraApiModal, populateJiraApiExportEpics,
    showJiraApiStage2, showJiraApiStage1, generateJiraApiImportCall, jiraApiExportState,
    showAsanaExportModal, hideAsanaExportModal, confirmCloseAsanaModal, populateAsanaExportEpics,
    showAsanaStage2, showAsanaStage1, generateAsanaImportCall, asanaExportState,
    showAsanaCsvExportModal, hideAsanaCsvExportModal, confirmCloseAsanaCsvModal,
    populateAsanaCsvExportEpics, downloadAsanaCsv, asanaCsvExportState,
    // Proxy exports
    showJiraProxyExportModal, hideJiraProxyExportModal, confirmCloseJiraProxyModal,
    populateJiraProxyExportEpics, showJiraProxyStage2, showJiraProxyStage1,
    exportToJiraProxy, jiraProxyExportState, verifyJiraProxy,
    showPhabProxyExportModal, hidePhabProxyExportModal, confirmClosePhabProxyModal,
    populatePhabProxyExportEpics, showPhabProxyStage2, showPhabProxyStage1,
    exportToPhabProxy, phabProxyExportState, verifyPhabProxy,
    showAsanaProxyExportModal, hideAsanaProxyExportModal, confirmCloseAsanaProxyModal,
    populateAsanaProxyExportEpics, showAsanaProxyStage2, showAsanaProxyStage1,
    exportToAsanaProxy, asanaProxyExportState, verifyAsanaProxy,
    showLinearProxyExportModal, hideLinearProxyExportModal, confirmCloseLinearProxyModal,
    populateLinearProxyExportEpics, showLinearProxyStage2, showLinearProxyStage1,
    exportToLinearProxy, linearProxyExportState, verifyLinearProxy,
} = exportsMod;

// Import module
const onImportComplete = async (data) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    try {
        if (isFromWelcome) {
            hideWelcomeScreen();
            initState();
            const mapId = await newMapId();
            state.mapId = mapId;
            history.replaceState({ mapId }, '', `/${mapId}`);
            await createYjsDoc(mapId);
        } else {
            await createAutoBackup('Auto: before import');
            pushUndo();
        }
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        log.logEvent('Imported map');
        requestAnimationFrame(zoomToFit);
        if (isFromWelcome) {
            subscribeToMap(state.mapId);
        }
    } catch {
        await showAlert('Failed to import: Invalid data format');
    }
};
importsMod.init({ dom, onImportComplete });
const {
    showJiraImportModal, hideJiraImportModal, confirmCloseJiraImportModal,
    verifyJiraImport, fetchFromJira, showJiraImportStage1, confirmJiraImport,
    showJiraCsvImportModal, handleJiraCsvFile,
} = importsMod;

asanaImportsMod.init({ dom, onImportComplete });
const {
    showAsanaImportModal, hideAsanaImportModal, confirmCloseAsanaImportModal,
    verifyAsanaImport, fetchFromAsana, showAsanaImportStage1, confirmAsanaImport,
    showAsanaCsvImportModal, handleAsanaCsvFile, handleAsanaMappingModeChange,
} = asanaImportsMod;

phabImportsMod.init({ dom, onImportComplete });
const {
    showPhabCsvImportModal, hidePhabImportModal, confirmClosePhabImportModal,
    handlePhabCsvFile, showPhabImportStage1, confirmPhabImport,
} = phabImportsMod;

linearImportsMod.init({ dom, onImportComplete });
const {
    showLinearImportModal, hideLinearImportModal, confirmCloseLinearImportModal,
    verifyLinearImport, fetchFromLinear, showLinearImportStage1, confirmLinearImport,
    showLinearCsvImportModal, handleLinearCsvFile, handleLinearMappingModeChange,
} = linearImportsMod;

const showExportModal = async () => {
    _exportBackups = null;
    dom.exportModal.classList.add('visible');
    dom.exportFilename.value = sanitizeFilename(state.name || 'story-map');
    dom.exportMinify.checked = false;
    updateExportJson();
    // Fetch full backups to include in export
    if (state.mapId) {
        try {
            const res = await fetch(`/api/backups/${state.mapId}`);
            const meta = await res.json();
            if (meta.length) {
                const fullBackups = [];
                for (const b of meta) {
                    const r = await fetch(`/api/backups/${state.mapId}/${b.id}`);
                    if (r.ok) fullBackups.push(await r.json());
                }
                _exportBackups = fullBackups;
                updateExportJson();
            }
        } catch { /* best-effort */ }
    }
};

const hideExportModal = () => {
    dom.exportModal.classList.remove('visible');
};

const copyExportJson = async () => {
    const json = dom.exportJsonText.value;
    try {
        await navigator.clipboard.writeText(json);
        dom.exportCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportCopyBtn.textContent = 'Copy to Clipboard', 2000);
    } catch {
        dom.exportJsonText.select();
        document.execCommand('copy');
        dom.exportCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportCopyBtn.textContent = 'Copy to Clipboard', 2000);
    }
};

const downloadExportFile = () => {
    const filename = sanitizeFilename(dom.exportFilename.value) + '.json';
    const json = dom.exportJsonText.value;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideExportModal();
};

// YAML Export
const exportYaml = () => {
    if (dom.welcomeScreen.classList.contains('visible')) return;
    saveToStorage();
    showExportYamlModal();
};

const showExportYamlModal = async () => {
    dom.exportYamlModal.classList.add('visible');
    dom.exportYamlFilename.value = sanitizeFilename(state.name || 'story-map');
    const data = serialize();
    dom.exportYamlText.value = exportToYaml(data);
    // Fetch full backups to include in YAML export
    if (state.mapId) {
        try {
            const res = await fetch(`/api/backups/${state.mapId}`);
            const meta = await res.json();
            if (meta.length) {
                const fullBackups = [];
                for (const b of meta) {
                    const r = await fetch(`/api/backups/${state.mapId}/${b.id}`);
                    if (r.ok) fullBackups.push(await r.json());
                }
                data.backups = fullBackups;
                dom.exportYamlText.value = exportToYaml(data);
            }
        } catch { /* best-effort */ }
    }
};

const hideExportYamlModal = () => {
    dom.exportYamlModal.classList.remove('visible');
};

const copyExportYaml = async () => {
    const yaml = dom.exportYamlText.value;
    try {
        await navigator.clipboard.writeText(yaml);
        dom.exportYamlCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportYamlCopyBtn.textContent = 'Copy to Clipboard', 2000);
    } catch {
        dom.exportYamlText.select();
        document.execCommand('copy');
        dom.exportYamlCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportYamlCopyBtn.textContent = 'Copy to Clipboard', 2000);
    }
};

const downloadExportYamlFile = () => {
    const filename = sanitizeFilename(dom.exportYamlFilename.value) + '.yaml';
    const yaml = dom.exportYamlText.value;
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideExportYamlModal();
};

// CSV Import
const showImportCsvModal = () => {
    dom.importCsvModal.classList.add('visible');
    dom.importCsvText.value = '';
    dom.importCsvValidationError.classList.add('hidden');
    dom.importCsvText.focus();
};

const hideImportCsvModal = () => {
    dom.importCsvModal.classList.remove('visible');
    dom.importCsvText.value = '';
};

const importFromCsvText = async (csvText) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    dom.importCsvValidationError.classList.add('hidden');

    let data;
    try {
        data = importFromCsv(csvText);
    } catch (err) {
        dom.importCsvValidationError.textContent = err.message;
        dom.importCsvValidationError.classList.remove('hidden');
        return;
    }

    try {
        if (isFromWelcome) {
            hideWelcomeScreen();
            initState();
            const mapId = await newMapId();
            state.mapId = mapId;
            history.replaceState({ mapId }, '', `/${mapId}`);
            await createYjsDoc(mapId);
        } else {
            await createAutoBackup('Auto: before import');
            pushUndo();
        }
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        requestAnimationFrame(zoomToFit);
        hideImportCsvModal();
        if (isFromWelcome) {
            subscribeToMap(state.mapId);
        }
    } catch {
        await showAlert('Failed to import: Invalid data structure');
    }
};

const importCsvFile = async (file) => {
    const isFromWelcome = !state.mapId;

    if (!isFromWelcome) {
        saveToStorage();
        if (!await confirmOverwrite()) return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = importFromCsv(e.target.result);
            if (isFromWelcome) {
                hideWelcomeScreen();
                initState();
                const mapId = await newMapId();
                state.mapId = mapId;
                history.replaceState({ mapId }, '', `/${mapId}`);
                await createYjsDoc(mapId);
            } else {
                await createAutoBackup('Auto: before import');
                pushUndo();
            }
            deserialize(data);
            dom.boardName.value = state.name;
            renderAndSave();
            requestAnimationFrame(zoomToFit);
            if (isFromWelcome) {
                subscribeToMap(state.mapId);
            }
        } catch (err) {
            await showAlert('Failed to import: ' + (err.message || 'Invalid CSV format'));
        }
    };
    reader.readAsText(file);
};

// CSV Export
const exportCsv = () => {
    if (dom.welcomeScreen.classList.contains('visible')) return;
    saveToStorage();
    showExportCsvModal();
};

const showExportCsvModal = () => {
    dom.exportCsvModal.classList.add('visible');
    dom.exportCsvFilename.value = sanitizeFilename(state.name || 'story-map');
    const data = serialize();
    dom.exportCsvText.value = exportToCsv(data);
};

const hideExportCsvModal = () => {
    dom.exportCsvModal.classList.remove('visible');
};

const copyExportCsv = async () => {
    const csv = dom.exportCsvText.value;
    try {
        await navigator.clipboard.writeText(csv);
        dom.exportCsvCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportCsvCopyBtn.textContent = 'Copy to Clipboard', 2000);
    } catch {
        dom.exportCsvText.select();
        document.execCommand('copy');
        dom.exportCsvCopyBtn.textContent = 'Copied!';
        setTimeout(() => dom.exportCsvCopyBtn.textContent = 'Copy to Clipboard', 2000);
    }
};

const downloadExportCsvFile = () => {
    const filename = sanitizeFilename(dom.exportCsvFilename.value) + '.csv';
    const csv = dom.exportCsvText.value;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = el('a', null, { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
    hideExportCsvModal();
};

// =============================================================================
// Backups
// =============================================================================

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let toastTimer;
const showToast = (message, duration = 2500) => {
    clearTimeout(toastTimer);
    dom.appToast.textContent = message;
    dom.appToast.classList.add('visible');
    toastTimer = setTimeout(() => dom.appToast.classList.remove('visible'), duration);
};

const relativeTime = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString();
};

const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
};

const showBackupsModal = async () => {
    if (!state.mapId) return;
    dom.createBackupBtn.style.display = isMapEditable() ? '' : 'none';
    dom.backupsModal.classList.add('visible');
    await refreshBackupsList();
};

const hideBackupsModal = () => {
    dom.backupsModal.classList.remove('visible');
};

const updateBackupBadge = (count) => {
    if (count > 0) {
        dom.backupCountBadge.textContent = count;
        dom.backupCountBadge.classList.remove('hidden');
    } else {
        dom.backupCountBadge.classList.add('hidden');
    }
};

const refreshBackupsList = async () => {
    try {
        const res = await fetch(`/api/backups/${state.mapId}`);
        const backups = await res.json();
        updateBackupBadge(backups.length);
        if (!backups.length) {
            dom.backupsList.innerHTML = `<div class="backups-empty">
                <svg class="backups-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                <span>No backups yet</span>
            </div>`;
            return;
        }
        const isAuto = (note) => note && note.startsWith('Auto:');
        const editable = isMapEditable();
        const iconSvg = (b) => b.imported
            ? '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>'
            : isAuto(b.note)
            ? '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'
            : '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>';
        const iconClass = (b) => b.imported ? ' backup-icon-imported' : isAuto(b.note) ? ' backup-icon-auto' : '';
        const label = (b, safeNote) => {
            if (b.imported && safeNote) return safeNote;
            if (b.imported) return 'Imported backup';
            if (safeNote) return safeNote;
            return isAuto(b.note) ? 'Auto backup' : 'Manual backup';
        };
        dom.backupsList.innerHTML = backups.slice().sort((a, c) => new Date(c.timestamp) - new Date(a.timestamp)).map(b => {
            const safeId = escHtml(b.id);
            const safeNote = b.note ? escHtml(b.note) : '';
            return `
            <div class="backup-row" data-id="${safeId}">
                <div class="backup-icon${iconClass(b)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        ${iconSvg(b)}
                    </svg>
                </div>
                <div class="backup-info">
                    <div class="backup-time">${label(b, safeNote)}</div>
                    ${b.mapName ? `<div class="backup-meta">${b.imported ? '<span class="backup-imported-tag">Imported</span> &middot; ' : ''}${escHtml(b.mapName)}</div>` : (b.imported ? `<div class="backup-meta"><span class="backup-imported-tag">Imported</span></div>` : '')}
                    <div class="backup-meta" title="${new Date(b.timestamp).toLocaleString()}">${relativeTime(b.timestamp)} &middot; ${formatSize(b.size)}${b.cardCount ? ` &middot; ${b.cardCount} cards` : ''}</div>
                </div>
                <div class="backup-actions">
                    ${editable ? `<button class="backup-restore-btn" data-id="${safeId}">Restore</button>` : ''}
                    ${editable ? `<button class="backup-delete-btn" data-id="${safeId}" title="Delete">&times;</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch {
        dom.backupsList.innerHTML = '<div class="backups-empty">Failed to load backups</div>';
    }
};

const setCreateBtnLabel = (text) => {
    const svg = dom.createBackupBtn.querySelector('svg');
    dom.createBackupBtn.textContent = '';
    if (svg) dom.createBackupBtn.prepend(svg);
    dom.createBackupBtn.append(text);
};

const createBackup = async () => {
    const note = await showPrompt('Backup note (optional):');
    if (note === null) return;
    try {
        dom.createBackupBtn.disabled = true;
        setCreateBtnLabel('Creating...');
        await fetch(`/api/backups/${state.mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note }),
        });
        log.logEvent('Created backup');
        await refreshBackupsList();
    } catch {
        await showAlert('Failed to create backup');
    } finally {
        dom.createBackupBtn.disabled = false;
        setCreateBtnLabel('Create Backup');
    }
};

const restoreBackup = async (backupId) => {
    if (!isMapEditable()) {
        await showAlert('Cannot restore while the map is locked.');
        return;
    }
    if (!await showConfirm('Restore this backup? A safety backup of the current state will be created first.')) return;
    try {
        // Create safety backup
        await fetch(`/api/backups/${state.mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: 'Auto: before restore' }),
        });
        // Fetch backup data
        const res = await fetch(`/api/backups/${state.mapId}/${backupId}`);
        if (!res.ok) throw new Error('Backup not found');
        const backup = await res.json();
        const data = JSON.parse(backup.data);
        pushUndo();
        deserialize(data);
        dom.boardName.value = state.name;
        renderAndSave();
        hideBackupsModal();
        log.logEvent('Restored backup');
        showToast('Backup restored');
    } catch {
        await showAlert('Failed to restore backup');
    }
};

const deleteBackup = async (backupId) => {
    if (!await showConfirm('Delete this backup?')) return;
    try {
        await fetch(`/api/backups/${state.mapId}/${backupId}`, { method: 'DELETE' });
        log.logEvent('Deleted backup');
        await refreshBackupsList();
    } catch {
        await showAlert('Failed to delete backup');
    }
};

const loadSample = async (name) => {
    if (!state.mapId) {
        return startWithSample(name);
    }

    saveToStorage();
    if (!await confirmOverwrite()) return;

    try {
        const response = await fetch(`samples/${name}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error();
        pushUndo();
        deserialize(await response.json());
        dom.boardName.value = state.name;
        renderAndSave();
    } catch {
        await showAlert('Failed to load sample');
    }
};

const newMap = async () => {
    saveToStorage();
    if (hasContent() && !await showConfirm('Create a new story map?\n\nYou can return to this map using the back button.')) {
        return;
    }
    destroyYjs();

    state.mapId = null;

    hideWelcomeScreen();

    initState();
    dom.boardName.value = '';
    render();
    requestAnimationFrame(zoomToFit);

    const mapId = await newMapId();
    state.mapId = mapId;
    history.pushState({ mapId }, '', `/${mapId}`);

    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

const copyMap = async () => {
    saveToStorage();
    if (!await showConfirm('Copy this map?\n\nA copy will be created with a new URL.')) {
        return;
    }
    destroyYjs();

    const currentName = dom.boardName.value || 'Untitled';
    state.name = `${currentName} (Copy)`;
    dom.boardName.value = state.name;

    const mapId = await newMapId();
    state.mapId = mapId;
    history.pushState({ mapId }, '', `/${mapId}`);

    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

// =============================================================================
// Event Listeners
// =============================================================================

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// =============================================================================
// Search / Filter
// =============================================================================

let searchDebounceTimer = null;
const filterState = { statuses: new Set(), colors: new Set(), tags: new Set() };

const openSearch = () => {
    if (dom.searchBtn.disabled) return;
    dom.searchBar.classList.remove('hidden');
    dom.boardName.style.display = 'none';
    dom.storyMap.classList.add('search-active');
    dom.searchInput.focus();
};

const closeSearch = () => {
    dom.searchBar.classList.add('hidden');
    dom.boardName.style.display = '';
    dom.storyMap.classList.remove('search-active');
    dom.searchInput.value = '';
    closeFilterPanel();
    clearAllFilters();
    clearSearchFilter();
};

const clearSearchFilter = () => {
    dom.storyMap.querySelectorAll('.search-dimmed').forEach(el => el.classList.remove('search-dimmed'));
};

const hasActiveFilters = () => filterState.statuses.size > 0 || filterState.colors.size > 0 || filterState.tags.size > 0;

// Look up the state object for a card element
const getItemForStep = (step) => {
    const colId = step.dataset.columnId;
    const mainCol = state.columns.find(c => c.id === colId);
    if (mainCol) return mainCol;
    for (const pm of state.partialMaps) {
        const pmCol = pm.columns.find(c => c.id === colId);
        if (pmCol) return pmCol;
    }
    return undefined;
};

const getItemForStoryCard = (card) => {
    const storyId = card.dataset.storyId;
    const sliceId = card.dataset.sliceId;
    const colId = card.dataset.columnId;
    const rowType = card.dataset.rowType;
    if (rowType === 'users') {
        const main = state.users[colId]?.find(s => s.id === storyId);
        if (main) return main;
        for (const pm of state.partialMaps) {
            const found = pm.users?.[colId]?.find(s => s.id === storyId);
            if (found) return found;
        }
        return undefined;
    }
    if (rowType === 'activities') {
        const main = state.activities[colId]?.find(s => s.id === storyId);
        if (main) return main;
        for (const pm of state.partialMaps) {
            const found = pm.activities?.[colId]?.find(s => s.id === storyId);
            if (found) return found;
        }
        return undefined;
    }
    const slice = state.slices.find(s => s.id === sliceId);
    const mainStory = slice?.stories[colId]?.find(s => s.id === storyId);
    if (mainStory) return mainStory;
    for (const pm of state.partialMaps) {
        const found = pm.stories?.[sliceId]?.[colId]?.find(s => s.id === storyId);
        if (found) return found;
    }
    return undefined;
};

const itemMatchesFilters = (item) => {
    if (!item) return false;
    if (filterState.statuses.size > 0) {
        const itemStatus = item.status || 'none';
        if (!filterState.statuses.has(itemStatus)) return false;
    }
    if (filterState.colors.size > 0) {
        const itemColor = (item.color || DEFAULT_CARD_COLORS.story).toLowerCase();
        if (!filterState.colors.has(itemColor)) return false;
    }
    if (filterState.tags.size > 0) {
        const itemTags = item.tags || [];
        if (!itemTags.some(t => filterState.tags.has(t))) return false;
    }
    return true;
};

const applySearchFilter = (query) => {
    clearSearchFilter();
    const q = query?.toLowerCase() || '';
    const filtering = hasActiveFilters();

    if (!q && !filtering) return;

    // Dim non-matching step cards
    dom.storyMap.querySelectorAll('.step').forEach(step => {
        const text = step.querySelector('.step-text')?.value?.toLowerCase() || '';
        const textMatch = !q || text.includes(q);
        const filterMatch = !filtering || itemMatchesFilters(getItemForStep(step));
        if (!textMatch || !filterMatch) step.classList.add('search-dimmed');
    });

    // Dim non-matching story cards
    dom.storyMap.querySelectorAll('.story-card').forEach(card => {
        const text = (card.querySelector('.story-text')?.value
            || card.querySelector('.story-text-preview')?.textContent || '').toLowerCase();
        const textMatch = !q || text.includes(q);
        const filterMatch = !filtering || itemMatchesFilters(getItemForStoryCard(card));
        if (!textMatch || !filterMatch) card.classList.add('search-dimmed');
    });
};

// Filter panel
const getUsedStatusesAndColors = () => {
    const statuses = new Set();
    const colors = new Set();
    state.columns.forEach(c => { if (c.color) colors.add(c.color.toLowerCase()); });
    const addFromCards = (cards) => {
        cards.forEach(s => {
            if (s.status) statuses.add(s.status);
            else statuses.add('none');
            colors.add((s.color || DEFAULT_CARD_COLORS.story).toLowerCase());
        });
    };
    Object.values(state.users || {}).forEach(addFromCards);
    Object.values(state.activities || {}).forEach(addFromCards);
    state.slices.forEach(slice => {
        Object.values(slice.stories || {}).forEach(addFromCards);
    });
    (state.partialMaps || []).forEach(pm => {
        pm.columns.forEach(c => { if (c.color) colors.add(c.color.toLowerCase()); });
        Object.values(pm.users || {}).forEach(addFromCards);
        Object.values(pm.activities || {}).forEach(addFromCards);
        Object.values(pm.stories || {}).forEach(sliceStories => {
            Object.values(sliceStories).forEach(addFromCards);
        });
    });
    return { statuses, colors };
};

const populateFilterPanel = () => {
    const used = getUsedStatusesAndColors();
    // Status checkboxes
    dom.filterStatusList.innerHTML = '';
    const statusEntries = [['none', 'No Status', '#e5e5e5'], ...Object.entries(STATUS_OPTIONS).map(([k, v]) => [k, v.label, v.color])];
    statusEntries.forEach(([key, label, color]) => {
        const inUse = used.statuses.has(key);
        const lbl = el('label', 'filter-checkbox');
        if (!inUse) lbl.classList.add('filter-disabled');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = filterState.statuses.has(key);
        cb.disabled = !inUse;
        const dot = el('span', 'filter-status-dot');
        dot.style.backgroundColor = color;
        const text = el('span', null, { text: label });
        cb.addEventListener('change', () => {
            if (cb.checked) filterState.statuses.add(key); else filterState.statuses.delete(key);
            updateFilterCountBadge();
            applySearchFilter(dom.searchInput.value.trim());
        });
        lbl.append(cb, dot, text);
        dom.filterStatusList.appendChild(lbl);
    });

    // Color swatches
    dom.filterColorList.innerHTML = '';
    const colorEntries = Object.entries(CARD_COLORS);
    const usedColors = colorEntries.filter(([, hex]) => used.colors.has(hex.toLowerCase()));
    const unusedColors = colorEntries.filter(([, hex]) => !used.colors.has(hex.toLowerCase()));
    [...usedColors, ...unusedColors].forEach(([name, hex]) => {
        const inUse = used.colors.has(hex.toLowerCase());
        const swatch = el('button', 'filter-color-swatch', { title: name });
        swatch.style.backgroundColor = hex;
        if (!inUse) { swatch.classList.add('filter-disabled'); swatch.disabled = true; }
        if (filterState.colors.has(hex.toLowerCase())) swatch.classList.add('selected');
        swatch.addEventListener('click', () => {
            const lc = hex.toLowerCase();
            if (filterState.colors.has(lc)) {
                filterState.colors.delete(lc);
                swatch.classList.remove('selected');
            } else {
                filterState.colors.add(lc);
                swatch.classList.add('selected');
            }
            updateFilterCountBadge();
            applySearchFilter(dom.searchInput.value.trim());
        });
        dom.filterColorList.appendChild(swatch);
    });

    // Tag checkboxes
    dom.filterTagsList.innerHTML = '';
    const allTags = getAllTagsInMap();
    if (allTags.length === 0) {
        dom.filterTagsList.appendChild(el('span', 'filter-empty', { text: 'No tags in map' }));
    } else {
        allTags.forEach(tag => {
            const lbl = el('label', 'filter-checkbox');
            const cb = el('input');
            cb.type = 'checkbox';
            cb.checked = filterState.tags.has(tag);
            const text = el('span', null, { text: tag });
            cb.addEventListener('change', () => {
                if (cb.checked) filterState.tags.add(tag); else filterState.tags.delete(tag);
                updateFilterCountBadge();
                applySearchFilter(dom.searchInput.value.trim());
            });
            lbl.append(cb, text);
            dom.filterTagsList.appendChild(lbl);
        });
    }
};

const openFilterPanel = () => {
    populateFilterPanel();
    dom.filterPanel.classList.remove('hidden');
    dom.searchFilterBtn.classList.add('active');
};

const closeFilterPanel = () => {
    dom.filterPanel.classList.add('hidden');
    dom.searchFilterBtn.classList.remove('active');
};

const toggleFilterPanel = () => {
    if (dom.filterPanel.classList.contains('hidden')) openFilterPanel(); else closeFilterPanel();
};

const updateFilterCountBadge = () => {
    const count = filterState.statuses.size + filterState.colors.size + filterState.tags.size;
    dom.filterCount.textContent = count;
    dom.filterCount.classList.toggle('hidden', count === 0);
    dom.searchFilterBtn.classList.toggle('has-filters', count > 0);
};

const clearAllFilters = () => {
    filterState.statuses.clear();
    filterState.colors.clear();
    filterState.tags.clear();
    updateFilterCountBadge();
    applySearchFilter(dom.searchInput.value.trim());
};

const initEventListeners = () => {
    dom.logoLink.addEventListener('click', async (e) => {
        if (!state.mapId) return;
        e.preventDefault();
        if (!hasContent() || await showConfirm('Go to home page?\n\nYou can return to this map using the back button.')) {
            window.location.href = '/';
        }
    });

    dom.welcomeNewBtn.addEventListener('click', startNewMap);

    const launchTour = async () => {
        closeMainMenu();
        if (state.mapId && hasContent() && !await showConfirm('Load the tour sample?\n\nYou can return to this map using the back button.')) {
            return;
        }
        await startWithSample('story-mapping-101', { showToast: false });
        // Close legend panel so tour starts clean
        dom.controlsRight?.classList.remove('panel-open');
        dom.panelBody?.querySelectorAll('.panel-section').forEach(s => s.classList.remove('open'));
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tour.startTour();
    };
    dom.welcomeTourBtn.addEventListener('click', launchTour);
    dom.tourMenuBtn.addEventListener('click', launchTour);

    document.querySelector('.welcome-integrations')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.welcome-integration');
        if (!btn?.dataset.import) return;
        const importMap = {
            jira: showJiraImportModal,
            asana: showAsanaImportModal,
            phabricator: showPhabCsvImportModal,
            linear: showLinearImportModal,
        };
        importMap[btn.dataset.import]?.();
    });

    document.querySelector('.welcome-samples-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-sample');
        if (btn?.dataset.sample) {
            e.stopPropagation();
            startWithSample(btn.dataset.sample);
        }
    });

    // Force light mode for printing (dark backgrounds waste ink and browsers
    // skip background colours by default, causing illegible text).
    window.addEventListener('beforeprint', () => {
        if (document.documentElement.classList.contains('dark-mode')) {
            document.documentElement.dataset.wasDark = '1';
            document.documentElement.classList.remove('dark-mode');
        }
    });
    window.addEventListener('afterprint', () => {
        if (document.documentElement.dataset.wasDark) {
            delete document.documentElement.dataset.wasDark;
            document.documentElement.classList.add('dark-mode');
        }
    });

    window.addEventListener('popstate', async (e) => {
        // Ignore popstate from our own history.back() after closing expand modal
        if (_poppingExpandState) {
            _poppingExpandState = false;
            return;
        }
        // Back button closes expand modal instead of navigating
        if (_expandedItem) {
            _closingExpandViaBack = true;
            closeExpandModal();
            _closingExpandViaBack = false;
            return;
        }
        const mapId = window.location.pathname.slice(1) || null;
        if (mapId) {
            await loadMapById(mapId);
            hideWelcomeScreen();
        } else {
            destroyYjs();
            showWelcomeScreen();
        }
    });

    dom.boardName.addEventListener('input', (e) => {
        state.name = e.target.value;
        log.logTextEdit('map title', 'map');
        saveToStorage();
    });

    dom.boardName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            dom.boardName.blur();
        }
    });

    dom.newMapBtn.addEventListener('click', () => {
        closeMainMenu();
        newMap();
    });
    dom.copyExistingBtn.addEventListener('click', () => {
        closeMainMenu();
        copyMap();
    });
    dom.exportBtn.addEventListener('click', () => {
        closeMainMenu();
        exportMap();
    });
    dom.printBtn.addEventListener('click', () => {
        closeMainMenu();
        const originalTitle = document.title;
        document.title = sanitizeFilename(state.name || 'story-map');
        window.print();
        document.title = originalTitle;
    });
    // Backups
    dom.backupsBtn.addEventListener('click', () => {
        closeMainMenu();
        showBackupsModal();
    });
    dom.backupsModalClose.addEventListener('click', hideBackupsModal);
    dom.backupsModal.addEventListener('click', (e) => {
        if (e.target === dom.backupsModal) hideBackupsModal();
    });
    dom.createBackupBtn.addEventListener('click', createBackup);
    dom.backupsList.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('backup-restore-btn')) restoreBackup(id);
        else if (btn.classList.contains('backup-delete-btn')) deleteBackup(id);
    });

    dom.toggleCursorsBtn?.addEventListener('click', () => {
        toggleCursorsVisibility();
    });
    // Focus mode toggle
    let focusMode = localStorage.getItem('focusMode') === 'true';
    function applyFocusMode() {
        document.body.classList.toggle('focus-mode', focusMode);
        if (dom.toggleFocusModeBtn) {
            dom.toggleFocusModeBtn.classList.toggle('active', focusMode);
            dom.toggleFocusModeBtn.title = focusMode ? 'Exit focus mode' : 'Focus mode';
        }
    }
    applyFocusMode();
    dom.toggleFocusModeBtn?.addEventListener('click', () => {
        focusMode = !focusMode;
        localStorage.setItem('focusMode', focusMode);
        applyFocusMode();
    });
    // Dark mode toggle
    let darkMode = (() => {
        try {
            const stored = localStorage.getItem('darkMode');
            if (stored !== null) return stored === 'true';
        } catch (e) {}
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    })();
    function applyDarkMode() {
        document.documentElement.classList.toggle('dark-mode', darkMode);
        if (dom.toggleDarkModeBtn) {
            dom.toggleDarkModeBtn.classList.toggle('active', darkMode);
            dom.toggleDarkModeBtn.title = darkMode ? 'Light mode' : 'Dark mode';
        }
    }
    applyDarkMode();
    dom.toggleDarkModeBtn?.addEventListener('click', () => {
        darkMode = !darkMode;
        try { localStorage.setItem('darkMode', darkMode); } catch (e) {}
        applyDarkMode();
    });
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        try { if (localStorage.getItem('darkMode') !== null) return; } catch (ex) {}
        darkMode = e.matches;
        applyDarkMode();
    });
    // Fullscreen mode — double-Esc to exit (single Esc is used by modals, expand view, etc.)
    let fullscreenMode = false;
    let lastFullscreenEsc = 0;
    let keyboardLocked = false;
    const updateFullscreenLabel = () => {
        if (dom.toggleFullscreenBtn) {
            dom.toggleFullscreenBtn.classList.toggle('active', fullscreenMode);
            dom.toggleFullscreenBtn.title = fullscreenMode ? 'Exit full screen' : 'Full screen';
        }
    };
    const enterFullscreenMode = () => {
        fullscreenMode = true;
        lastFullscreenEsc = 0;
        document.documentElement.requestFullscreen().then(() => {
            requestAnimationFrame(zoomToFit);
            // Keyboard Lock API (Chrome/Edge): prevent browser from auto-exiting on Esc
            if (navigator.keyboard?.lock) {
                navigator.keyboard.lock(['Escape']).then(() => { keyboardLocked = true; }).catch(() => {});
            }
        }).catch(() => { fullscreenMode = false; });
    };
    const exitFullscreenMode = () => {
        fullscreenMode = false;
        lastFullscreenEsc = 0;
        keyboardLocked = false;
        if (document.fullscreenElement) {
            const p = document.exitFullscreen();
            if (p?.then) p.then(() => requestAnimationFrame(zoomToFit));
        }
    };
    if (dom.toggleFullscreenBtn && !document.fullscreenEnabled) {
        dom.toggleFullscreenBtn.remove();
    }
    dom.toggleFullscreenBtn?.addEventListener('click', () => {
        if (fullscreenMode) exitFullscreenMode();
        else enterFullscreenMode();
    });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && fullscreenMode) {
            // Browser exited fullscreen (Esc without keyboard lock) — re-enter
            document.documentElement.requestFullscreen().then(() => {
                if (navigator.keyboard?.lock) {
                    navigator.keyboard.lock(['Escape']).then(() => { keyboardLocked = true; }).catch(() => {});
                }
            }).catch(() => { fullscreenMode = false; requestAnimationFrame(zoomToFit); });
        }
        if (!document.fullscreenElement && !fullscreenMode) {
            keyboardLocked = false;
            requestAnimationFrame(zoomToFit);
        }
        updateFullscreenLabel();
    });
    dom.importJsonMenuItem.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showImportModal();
    });
    dom.importYamlMenuItem.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showImportYamlModal();
    });
    dom.importCsvMenuItem.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showImportCsvModal();
    });
    dom.importJiraBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showJiraImportModal();
    });

    // Jira Import modal events
    dom.jiraImportModalClose.addEventListener('click', confirmCloseJiraImportModal);
    dom.jiraImportModal.addEventListener('click', (e) => {
        if (e.target === dom.jiraImportModal) confirmCloseJiraImportModal();
    });
    dom.jiraImportCancel.addEventListener('click', confirmCloseJiraImportModal);
    dom.jiraImportVerifyBtn.addEventListener('click', verifyJiraImport);
    dom.jiraImportFetchBtn.addEventListener('click', fetchFromJira);
    dom.jiraImportBack.addEventListener('click', showJiraImportStage1);
    dom.jiraImportConfirmBtn.addEventListener('click', confirmJiraImport);

    // Jira CSV Import
    dom.importJiraCsvBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showJiraCsvImportModal();
    });
    dom.jiraCsvDropzone.addEventListener('click', () => dom.jiraCsvFileInput.click());
    dom.jiraCsvDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.jiraCsvDropzone.classList.add('dragover');
    });
    dom.jiraCsvDropzone.addEventListener('dragleave', () => {
        dom.jiraCsvDropzone.classList.remove('dragover');
    });
    dom.jiraCsvDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.jiraCsvDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            dom.jiraCsvDropzone.querySelector('span').textContent = file.name;
            dom.jiraCsvImportParseBtn.disabled = false;
            dom.jiraCsvFileInput._droppedFile = file;
        }
    });
    dom.jiraCsvFileInput.addEventListener('change', () => {
        const file = dom.jiraCsvFileInput.files[0];
        if (file) {
            dom.jiraCsvDropzone.querySelector('span').textContent = file.name;
            dom.jiraCsvImportParseBtn.disabled = false;
            dom.jiraCsvFileInput._droppedFile = null;
        }
    });
    dom.jiraCsvImportParseBtn.addEventListener('click', () => {
        const file = dom.jiraCsvFileInput._droppedFile || dom.jiraCsvFileInput.files[0];
        handleJiraCsvFile(file);
    });
    dom.jiraCsvImportCancel.addEventListener('click', confirmCloseJiraImportModal);

    // Asana Import
    dom.importAsanaBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showAsanaImportModal();
    });

    // Asana Import modal events
    dom.asanaImportModalClose.addEventListener('click', confirmCloseAsanaImportModal);
    dom.asanaImportModal.addEventListener('click', (e) => {
        if (e.target === dom.asanaImportModal) confirmCloseAsanaImportModal();
    });
    dom.asanaImportCancel.addEventListener('click', confirmCloseAsanaImportModal);
    dom.asanaImportVerifyBtn.addEventListener('click', verifyAsanaImport);
    dom.asanaImportFetchBtn.addEventListener('click', fetchFromAsana);
    dom.asanaImportBack.addEventListener('click', showAsanaImportStage1);
    dom.asanaImportConfirmBtn.addEventListener('click', confirmAsanaImport);
    dom.asanaImportMappingMode.addEventListener('change', (e) => {
        if (e.target.name === 'asanaMappingMode') handleAsanaMappingModeChange(e.target.value);
    });

    // Asana CSV Import
    dom.importAsanaCsvBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showAsanaCsvImportModal();
    });
    dom.asanaCsvDropzone.addEventListener('click', () => dom.asanaCsvFileInput.click());
    dom.asanaCsvDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.asanaCsvDropzone.classList.add('dragover');
    });
    dom.asanaCsvDropzone.addEventListener('dragleave', () => {
        dom.asanaCsvDropzone.classList.remove('dragover');
    });
    dom.asanaCsvDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.asanaCsvDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            dom.asanaCsvDropzone.querySelector('span').textContent = file.name;
            dom.asanaCsvImportParseBtn.disabled = false;
            dom.asanaCsvFileInput._droppedFile = file;
        }
    });
    dom.asanaCsvFileInput.addEventListener('change', () => {
        const file = dom.asanaCsvFileInput.files[0];
        if (file) {
            dom.asanaCsvDropzone.querySelector('span').textContent = file.name;
            dom.asanaCsvImportParseBtn.disabled = false;
            dom.asanaCsvFileInput._droppedFile = null;
        }
    });
    dom.asanaCsvImportParseBtn.addEventListener('click', () => {
        const file = dom.asanaCsvFileInput._droppedFile || dom.asanaCsvFileInput.files[0];
        handleAsanaCsvFile(file);
    });
    dom.asanaCsvImportCancel.addEventListener('click', confirmCloseAsanaImportModal);

    // Phabricator CSV Import
    dom.importPhabCsvBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showPhabCsvImportModal();
    });
    dom.phabImportModalClose.addEventListener('click', confirmClosePhabImportModal);
    dom.phabImportModal.addEventListener('click', (e) => {
        if (e.target === dom.phabImportModal) confirmClosePhabImportModal();
    });
    dom.phabCsvImportCancel.addEventListener('click', confirmClosePhabImportModal);
    dom.phabCsvDropzone.addEventListener('click', () => dom.phabCsvFileInput.click());
    dom.phabCsvDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.phabCsvDropzone.classList.add('dragover');
    });
    dom.phabCsvDropzone.addEventListener('dragleave', () => {
        dom.phabCsvDropzone.classList.remove('dragover');
    });
    dom.phabCsvDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.phabCsvDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            dom.phabCsvDropzone.querySelector('span').textContent = file.name;
            dom.phabCsvImportParseBtn.disabled = false;
            dom.phabCsvFileInput._droppedFile = file;
        }
    });
    dom.phabCsvFileInput.addEventListener('change', () => {
        const file = dom.phabCsvFileInput.files[0];
        if (file) {
            dom.phabCsvDropzone.querySelector('span').textContent = file.name;
            dom.phabCsvImportParseBtn.disabled = false;
            dom.phabCsvFileInput._droppedFile = null;
        }
    });
    dom.phabCsvImportParseBtn.addEventListener('click', () => {
        const file = dom.phabCsvFileInput._droppedFile || dom.phabCsvFileInput.files[0];
        handlePhabCsvFile(file);
    });
    dom.phabImportBack.addEventListener('click', showPhabImportStage1);
    dom.phabImportConfirmBtn.addEventListener('click', confirmPhabImport);

    // Linear API Import
    dom.importLinearBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showLinearImportModal();
    });

    // Linear Import modal events
    dom.linearImportModalClose.addEventListener('click', confirmCloseLinearImportModal);
    dom.linearImportModal.addEventListener('click', (e) => {
        if (e.target === dom.linearImportModal) confirmCloseLinearImportModal();
    });
    dom.linearImportCancel.addEventListener('click', confirmCloseLinearImportModal);
    dom.linearImportVerifyBtn.addEventListener('click', verifyLinearImport);
    dom.linearImportFetchBtn.addEventListener('click', fetchFromLinear);
    dom.linearImportBack.addEventListener('click', showLinearImportStage1);
    dom.linearImportConfirmBtn.addEventListener('click', confirmLinearImport);
    dom.linearImportMappingMode.addEventListener('change', (e) => {
        if (e.target.name === 'linearMappingMode') handleLinearMappingModeChange(e.target.value);
    });

    // Linear CSV Import
    dom.importLinearCsvBtn.addEventListener('click', async () => {
        closeMainMenu();
        if (lockState.isLocked && !lockState.sessionUnlocked) {
            await showAlert('This map is read-only. Unlock it first to import.');
            return;
        }
        showLinearCsvImportModal();
    });
    dom.linearCsvDropzone.addEventListener('click', () => dom.linearCsvFileInput.click());
    dom.linearCsvDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.linearCsvDropzone.classList.add('dragover');
    });
    dom.linearCsvDropzone.addEventListener('dragleave', () => {
        dom.linearCsvDropzone.classList.remove('dragover');
    });
    dom.linearCsvDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.linearCsvDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            dom.linearCsvDropzone.querySelector('span').textContent = file.name;
            dom.linearCsvImportParseBtn.disabled = false;
            dom.linearCsvFileInput._droppedFile = file;
        }
    });
    dom.linearCsvFileInput.addEventListener('change', () => {
        const file = dom.linearCsvFileInput.files[0];
        if (file) {
            dom.linearCsvDropzone.querySelector('span').textContent = file.name;
            dom.linearCsvImportParseBtn.disabled = false;
            dom.linearCsvFileInput._droppedFile = null;
        }
    });
    dom.linearCsvImportParseBtn.addEventListener('click', () => {
        const file = dom.linearCsvFileInput._droppedFile || dom.linearCsvFileInput.files[0];
        handleLinearCsvFile(file);
    });
    dom.linearCsvImportCancel.addEventListener('click', confirmCloseLinearImportModal);

    // Import JSON modal events
    dom.importModalClose.addEventListener('click', hideImportModal);
    dom.importModal.addEventListener('click', (e) => {
        if (e.target === dom.importModal) hideImportModal();
    });
    dom.importJsonBtn.addEventListener('click', () => {
        const jsonText = dom.importJsonText.value.trim();
        if (jsonText) importFromJsonText(jsonText);
    });
    dom.importJsonText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const jsonText = dom.importJsonText.value.trim();
            if (jsonText) importFromJsonText(jsonText);
        }
    });
    dom.importDropzone.addEventListener('click', () => {
        dom.importFileInput.click();
    });
    dom.importFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            hideImportModal();
            importMap(e.target.files[0]);
            e.target.value = '';
        }
    });
    dom.importDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.importDropzone.classList.add('dragover');
    });
    dom.importDropzone.addEventListener('dragleave', () => {
        dom.importDropzone.classList.remove('dragover');
    });
    dom.importDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.importDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
            hideImportModal();
            importMap(file);
        }
    });

    // Import YAML modal events
    dom.importYamlModalClose.addEventListener('click', hideImportYamlModal);
    dom.importYamlModal.addEventListener('click', (e) => {
        if (e.target === dom.importYamlModal) hideImportYamlModal();
    });
    dom.importYamlBtn.addEventListener('click', () => {
        const yamlText = dom.importYamlText.value.trim();
        if (yamlText) importFromYamlText(yamlText);
    });
    dom.importYamlText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const yamlText = dom.importYamlText.value.trim();
            if (yamlText) importFromYamlText(yamlText);
        }
    });
    dom.importYamlDropzone.addEventListener('click', () => {
        dom.importYamlFileInput.click();
    });
    dom.importYamlFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            hideImportYamlModal();
            importYamlFile(e.target.files[0]);
            e.target.value = '';
        }
    });
    dom.importYamlDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.importYamlDropzone.classList.add('dragover');
    });
    dom.importYamlDropzone.addEventListener('dragleave', () => {
        dom.importYamlDropzone.classList.remove('dragover');
    });
    dom.importYamlDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.importYamlDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.yaml') || file.name.endsWith('.yml'))) {
            hideImportYamlModal();
            importYamlFile(file);
        }
    });

    // Import CSV modal events
    dom.importCsvModalClose.addEventListener('click', hideImportCsvModal);
    dom.importCsvModal.addEventListener('click', (e) => {
        if (e.target === dom.importCsvModal) hideImportCsvModal();
    });
    dom.importCsvBtn.addEventListener('click', () => {
        const csvText = dom.importCsvText.value.trim();
        if (csvText) importFromCsvText(csvText);
    });
    dom.importCsvText.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const csvText = dom.importCsvText.value.trim();
            if (csvText) importFromCsvText(csvText);
        }
    });
    dom.importCsvDropzone.addEventListener('click', () => {
        dom.importCsvFileInput.click();
    });
    dom.importCsvFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            hideImportCsvModal();
            importCsvFile(e.target.files[0]);
            e.target.value = '';
        }
    });
    dom.importCsvDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.importCsvDropzone.classList.add('dragover');
    });
    dom.importCsvDropzone.addEventListener('dragleave', () => {
        dom.importCsvDropzone.classList.remove('dragover');
    });
    dom.importCsvDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.importCsvDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            hideImportCsvModal();
            importCsvFile(file);
        }
    });

    // Export JSON modal events
    dom.exportModalClose.addEventListener('click', hideExportModal);
    dom.exportModal.addEventListener('click', (e) => {
        if (e.target === dom.exportModal) hideExportModal();
    });
    dom.exportMinify.addEventListener('change', updateExportJson);
    dom.exportCopyBtn.addEventListener('click', copyExportJson);
    dom.exportDownloadBtn.addEventListener('click', downloadExportFile);

    // Export YAML modal events
    dom.exportYamlBtn.addEventListener('click', () => {
        closeMainMenu();
        exportYaml();
    });
    dom.exportYamlModalClose.addEventListener('click', hideExportYamlModal);
    dom.exportYamlModal.addEventListener('click', (e) => {
        if (e.target === dom.exportYamlModal) hideExportYamlModal();
    });
    dom.exportYamlCopyBtn.addEventListener('click', copyExportYaml);
    dom.exportYamlDownloadBtn.addEventListener('click', downloadExportYamlFile);

    // Export CSV modal events
    dom.exportCsvBtn.addEventListener('click', () => {
        closeMainMenu();
        exportCsv();
    });
    dom.exportCsvModalClose.addEventListener('click', hideExportCsvModal);
    dom.exportCsvModal.addEventListener('click', (e) => {
        if (e.target === dom.exportCsvModal) hideExportCsvModal();
    });
    dom.exportCsvCopyBtn.addEventListener('click', copyExportCsv);
    dom.exportCsvDownloadBtn.addEventListener('click', downloadExportCsvFile);

    // Jira Export Modal
    dom.exportJiraBtn.addEventListener('click', () => {
        closeMainMenu();
        showJiraExportModal();
    });
    dom.jiraExportModalClose.addEventListener('click', confirmCloseJiraExportModal);
    dom.jiraExportModal.addEventListener('click', (e) => {
        if (e.target === dom.jiraExportModal) confirmCloseJiraExportModal();
    });
    dom.jiraExportCancel.addEventListener('click', confirmCloseJiraExportModal);
    dom.jiraExportDownload.addEventListener('click', () => {
        downloadJiraCsv();
    });
    [dom.jiraStatusNone, dom.jiraStatusPlanned, dom.jiraStatusInProgress, dom.jiraStatusDone].forEach(input => {
        input.addEventListener('input', populateJiraExportEpics);
    });
    const statusFilters = [
        { el: dom.jiraFilterNone, status: 'none' },
        { el: dom.jiraFilterPlanned, status: 'planned' },
        { el: dom.jiraFilterInProgress, status: 'in-progress' },
        { el: dom.jiraFilterDone, status: 'done' }
    ];
    statusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                jiraExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                jiraExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateJiraExportEpics();
        });
    });

    // Phabricator Export Modal
    dom.exportPhabBtn.addEventListener('click', () => {
        if (dom.exportPhabBtn.disabled) return;
        closeMainMenu();
        showPhabExportModal();
    });
    dom.phabExportModalClose.addEventListener('click', confirmClosePhabModal);
    dom.phabExportModal.addEventListener('click', (e) => {
        if (e.target === dom.phabExportModal) confirmClosePhabModal();
    });
    dom.phabExportCancel.addEventListener('click', confirmClosePhabModal);
    dom.phabExportNext.addEventListener('click', showPhabStage2);
    dom.phabExportBack.addEventListener('click', showPhabStage1);
    dom.phabExportDone.addEventListener('click', hidePhabExportModal);
    dom.phabCopyFunction.addEventListener('click', () => {
        copyPhabCode(dom.phabImportFunction, dom.phabCopyFunction);
    });
    dom.phabCopyCall.addEventListener('click', () => {
        copyPhabCode(dom.phabImportCall, dom.phabCopyCall);
    });
    document.getElementById('phabTokenHelpLink')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await showAlert('To get your API token:\n\n1. Click your profile picture in Phabricator\n2. Go to Settings\n3. Click "Conduit API Tokens"\n4. Click "Generate Token"');
    });
    dom.phabInstanceUrl.addEventListener('input', () => {
        dom.phabImportFunction.textContent = generatePhabImportFunction();
    });
    dom.phabApiToken.addEventListener('input', () => {
        dom.phabImportCall.textContent = generatePhabImportCall();
    });
    dom.phabTags.addEventListener('input', () => {
        dom.phabImportCall.textContent = generatePhabImportCall();
    });
    const phabStatusFilters = [
        { el: dom.phabFilterNone, status: 'none' },
        { el: dom.phabFilterPlanned, status: 'planned' },
        { el: dom.phabFilterInProgress, status: 'in-progress' },
        { el: dom.phabFilterDone, status: 'done' }
    ];
    phabStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                phabExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                phabExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populatePhabExportEpics();
        });
    });

    // Asana CSV Export Modal
    dom.exportAsanaCsvBtn.addEventListener('click', () => {
        if (dom.exportAsanaCsvBtn.disabled) return;
        closeMainMenu();
        showAsanaCsvExportModal();
    });
    dom.asanaCsvExportModalClose.addEventListener('click', confirmCloseAsanaCsvModal);
    dom.asanaCsvExportModal.addEventListener('click', (e) => {
        if (e.target === dom.asanaCsvExportModal) confirmCloseAsanaCsvModal();
    });
    dom.asanaCsvExportCancel.addEventListener('click', confirmCloseAsanaCsvModal);
    dom.asanaCsvExportDownload.addEventListener('click', downloadAsanaCsv);
    const asanaCsvStatusFilters = [
        { el: dom.asanaCsvFilterNone, status: 'none' },
        { el: dom.asanaCsvFilterPlanned, status: 'planned' },
        { el: dom.asanaCsvFilterInProgress, status: 'in-progress' },
        { el: dom.asanaCsvFilterDone, status: 'done' }
    ];
    asanaCsvStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                asanaCsvExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                asanaCsvExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateAsanaCsvExportEpics();
        });
    });

    // Jira Proxy Export Modal
    dom.exportJiraProxyBtn.addEventListener('click', () => {
        if (dom.exportJiraProxyBtn.disabled) return;
        closeMainMenu();
        showJiraProxyExportModal();
    });
    dom.jiraProxyExportModalClose.addEventListener('click', confirmCloseJiraProxyModal);
    dom.jiraProxyExportModal.addEventListener('click', (e) => {
        if (e.target === dom.jiraProxyExportModal) confirmCloseJiraProxyModal();
    });
    dom.jiraProxyExportCancel.addEventListener('click', confirmCloseJiraProxyModal);
    dom.jiraProxyExportNext.addEventListener('click', showJiraProxyStage2);
    dom.jiraProxyExportBack.addEventListener('click', showJiraProxyStage1);
    dom.jiraProxyExportRun.addEventListener('click', exportToJiraProxy);
    dom.jiraProxyVerifyBtn.addEventListener('click', verifyJiraProxy);
    const jiraProxyStatusFilters = [
        { el: dom.jiraProxyFilterNone, status: 'none' },
        { el: dom.jiraProxyFilterPlanned, status: 'planned' },
        { el: dom.jiraProxyFilterInProgress, status: 'in-progress' },
        { el: dom.jiraProxyFilterDone, status: 'done' }
    ];
    jiraProxyStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                jiraProxyExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                jiraProxyExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateJiraProxyExportEpics();
        });
    });

    // Phabricator Proxy Export Modal
    dom.exportPhabProxyBtn.addEventListener('click', () => {
        if (dom.exportPhabProxyBtn.disabled) return;
        closeMainMenu();
        showPhabProxyExportModal();
    });
    dom.phabProxyExportModalClose.addEventListener('click', confirmClosePhabProxyModal);
    dom.phabProxyExportModal.addEventListener('click', (e) => {
        if (e.target === dom.phabProxyExportModal) confirmClosePhabProxyModal();
    });
    dom.phabProxyExportCancel.addEventListener('click', confirmClosePhabProxyModal);
    dom.phabProxyExportNext.addEventListener('click', showPhabProxyStage2);
    dom.phabProxyExportBack.addEventListener('click', showPhabProxyStage1);
    dom.phabProxyExportRun.addEventListener('click', exportToPhabProxy);
    dom.phabProxyVerifyBtn.addEventListener('click', verifyPhabProxy);
    dom.phabProxyInstanceUrl.addEventListener('input', () => {
        const url = dom.phabProxyInstanceUrl.value.trim().toLowerCase();
        dom.phabProxyWikimediaWarning.classList.toggle('hidden', !url.includes('phabricator.wikimedia.org'));
    });
    document.getElementById('phabProxyTokenHelpLink')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await showAlert('To get your API token:\n\n1. Click your profile picture in Phabricator\n2. Go to Settings\n3. Click "Conduit API Tokens"\n4. Click "Generate Token"');
    });
    const phabProxyStatusFilters = [
        { el: dom.phabProxyFilterNone, status: 'none' },
        { el: dom.phabProxyFilterPlanned, status: 'planned' },
        { el: dom.phabProxyFilterInProgress, status: 'in-progress' },
        { el: dom.phabProxyFilterDone, status: 'done' }
    ];
    phabProxyStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                phabProxyExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                phabProxyExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populatePhabProxyExportEpics();
        });
    });

    // Asana Proxy Export Modal
    dom.exportAsanaProxyBtn.addEventListener('click', () => {
        if (dom.exportAsanaProxyBtn.disabled) return;
        closeMainMenu();
        showAsanaProxyExportModal();
    });
    dom.asanaProxyExportModalClose.addEventListener('click', confirmCloseAsanaProxyModal);
    dom.asanaProxyExportModal.addEventListener('click', (e) => {
        if (e.target === dom.asanaProxyExportModal) confirmCloseAsanaProxyModal();
    });
    dom.asanaProxyExportCancel.addEventListener('click', confirmCloseAsanaProxyModal);
    dom.asanaProxyExportNext.addEventListener('click', showAsanaProxyStage2);
    dom.asanaProxyExportBack.addEventListener('click', showAsanaProxyStage1);
    dom.asanaProxyExportRun.addEventListener('click', exportToAsanaProxy);
    dom.asanaProxyVerifyBtn.addEventListener('click', verifyAsanaProxy);
    const asanaProxyStatusFilters = [
        { el: dom.asanaProxyFilterNone, status: 'none' },
        { el: dom.asanaProxyFilterPlanned, status: 'planned' },
        { el: dom.asanaProxyFilterInProgress, status: 'in-progress' },
        { el: dom.asanaProxyFilterDone, status: 'done' }
    ];
    asanaProxyStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                asanaProxyExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                asanaProxyExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateAsanaProxyExportEpics();
        });
    });

    // Linear Proxy Export Modal
    dom.exportLinearProxyBtn.addEventListener('click', () => {
        if (dom.exportLinearProxyBtn.disabled) return;
        closeMainMenu();
        showLinearProxyExportModal();
    });
    dom.linearProxyExportModalClose.addEventListener('click', confirmCloseLinearProxyModal);
    dom.linearProxyExportModal.addEventListener('click', (e) => {
        if (e.target === dom.linearProxyExportModal) confirmCloseLinearProxyModal();
    });
    dom.linearProxyExportCancel.addEventListener('click', confirmCloseLinearProxyModal);
    dom.linearProxyExportNext.addEventListener('click', showLinearProxyStage2);
    dom.linearProxyExportBack.addEventListener('click', showLinearProxyStage1);
    dom.linearProxyExportRun.addEventListener('click', exportToLinearProxy);
    dom.linearProxyVerifyBtn.addEventListener('click', verifyLinearProxy);
    const linearProxyStatusFilters = [
        { el: dom.linearProxyFilterNone, status: 'none' },
        { el: dom.linearProxyFilterPlanned, status: 'planned' },
        { el: dom.linearProxyFilterInProgress, status: 'in-progress' },
        { el: dom.linearProxyFilterDone, status: 'done' }
    ];
    linearProxyStatusFilters.forEach(({ el: checkbox, status }) => {
        checkbox.addEventListener('change', (e) => {
            const label = checkbox.closest('label');
            if (e.target.checked) {
                linearProxyExportState.selectedStatuses.add(status);
                label.classList.add('checked');
            } else {
                linearProxyExportState.selectedStatuses.delete(status);
                label.classList.remove('checked');
            }
            populateLinearProxyExportEpics();
        });
    });

    // Share dropdown
    dom.shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMainMenu();
        const onMap = !dom.welcomeScreen.classList.contains('visible');
        dom.shareScreenshot.disabled = !onMap;
        dom.shareDownload.disabled = !onMap;
        dom.shareMenu.classList.toggle('visible');
    });
    dom.shareCopyLink.addEventListener('click', async (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            dom.shareBtn.textContent = 'Copied!';
            setTimeout(() => dom.shareBtn.textContent = 'Share', 2000);
        } catch {
            await showPrompt('Copy this link to share:', url);
        }
    });
    const captureMap = async () => {
        const dpr = Math.max(window.devicePixelRatio || 2, 2);
        const isDark = document.documentElement.classList.contains('dark-mode');
        const bgColor = isDark ? '#0f172a' : '#f8fafc';

        const mapEl = dom.storyMap;

        let mapCanvas;
        if (isSafari) {
            // Safari: use html-to-image (SVG foreignObject) — html2canvas hangs on SVG rendering
            if (!window._htmlToImage) {
                const mod = await import('/vendor/html-to-image.bundle.js');
                window._htmlToImage = mod;
            }
            mapCanvas = await window._htmlToImage.toCanvas(mapEl, {
                backgroundColor: bgColor,
                pixelRatio: dpr,
                skipFonts: true,
                style: {
                    transform: 'none',
                    margin: '0',
                    minWidth: '0',
                    padding: '24px',
                },
            });
        } else {
            // Chrome/Firefox: use html2canvas (foreignObject has rendering issues in Firefox)
            if (!window._html2canvas) {
                const mod = await import('/vendor/html2canvas.bundle.js');
                window._html2canvas = mod.default;
            }
            mapCanvas = await window._html2canvas(mapEl, {
                backgroundColor: bgColor,
                scale: dpr,
                useCORS: true,
                onclone: (clonedDoc) => {
                    const clonedMap = clonedDoc.getElementById('storyMap');
                    Object.assign(clonedMap.style, {
                        transform: 'none',
                        margin: '0',
                        minWidth: '0',
                        padding: '24px',
                    });
                    for (const ta of clonedDoc.querySelectorAll('.story-text')) {
                        const div = clonedDoc.createElement('div');
                        div.className = ta.className;
                        div.textContent = ta.value;
                        div.style.whiteSpace = 'pre-wrap';
                        div.style.wordBreak = 'break-word';
                        ta.replaceWith(div);
                    }
                },
            });
        }

        // Draw logo with canvas API (avoids html2canvas SVG issues in Safari)
        const logoPad = 24 * dpr;
        const logoGap = 60 * dpr;
        const iconSize = 28 * dpr;
        const logoTextSize = 20 * dpr;
        const logoFont = `700 ${logoTextSize}px system-ui, -apple-system, sans-serif`;
        const textColor = isDark ? '#e2e8f0' : '#333';

        // Measure logo text width
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        measureCtx.font = logoFont;
        const logoTextW = measureCtx.measureText('Storymaps.io').width;
        const logoGapInner = 10 * dpr; // gap between icon and text
        const logoW = iconSize + logoGapInner + logoTextW;
        const logoH = Math.max(iconSize, logoTextSize);

        // Composite: logo on top, then map below with spacing
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = Math.max(mapCanvas.width, logoW + logoPad * 2);
        finalCanvas.height = mapCanvas.height + logoH + logoPad + logoGap;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        // Draw 4-square SVG icon with canvas
        const ix = logoPad, iy = logoPad;
        const rectSize = iconSize * 7 / 24; // 7/24 of icon size (matches viewBox)
        const rr = iconSize * 1 / 24; // corner radius
        const squares = [
            { x: iconSize * 3 / 24, y: iconSize * 3 / 24, fill: '#fef08a', stroke: '#d4aa00' },
            { x: iconSize * 14 / 24, y: iconSize * 3 / 24, fill: '#fecdd3', stroke: '#e88a9a' },
            { x: iconSize * 3 / 24, y: iconSize * 14 / 24, fill: '#a5f3fc', stroke: '#67c5d6' },
            { x: iconSize * 14 / 24, y: iconSize * 14 / 24, fill: '#14b8a6', stroke: '#0d9488' },
        ];
        for (const sq of squares) {
            const sx = ix + sq.x, sy = iy + sq.y;
            ctx.beginPath();
            ctx.roundRect(sx, sy, rectSize, rectSize, rr);
            ctx.fillStyle = sq.fill;
            ctx.fill();
            ctx.strokeStyle = sq.stroke;
            ctx.lineWidth = dpr;
            ctx.stroke();
        }

        // Draw "Storymaps.io" text
        ctx.font = logoFont;
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'middle';
        ctx.fillText('Storymaps.io', ix + iconSize + logoGapInner, iy + iconSize / 2);
        ctx.textBaseline = 'alphabetic';

        ctx.drawImage(mapCanvas, 0, logoH + logoPad + logoGap);

        // Draw legend in bottom-right corner
        if (state.legend?.length) {
            const s = dpr; // scale factor
            const font = `${13 * s}px system-ui, -apple-system, sans-serif`;
            const titleFont = `600 ${12 * s}px system-ui, -apple-system, sans-serif`;
            const swatchSize = 22 * s;
            const rowH = 28 * s;
            const pad = 14 * s;
            const gap = 6 * s;

            // Measure text widths
            ctx.font = font;
            const maxLabelW = Math.max(...state.legend.map(e => ctx.measureText(e.label).width));
            const boxW = pad + swatchSize + gap + maxLabelW + pad;
            const titleH = 18 * s;
            const boxH = pad + titleH + state.legend.length * rowH + pad;

            const bx = finalCanvas.width - boxW - logoPad;
            const by = finalCanvas.height - boxH - logoPad;

            // Background with rounded corners
            const r = 8 * s;
            ctx.beginPath();
            ctx.moveTo(bx + r, by);
            ctx.lineTo(bx + boxW - r, by);
            ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
            ctx.lineTo(bx + boxW, by + boxH - r);
            ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
            ctx.lineTo(bx + r, by + boxH);
            ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
            ctx.lineTo(bx, by + r);
            ctx.quadraticCurveTo(bx, by, bx + r, by);
            ctx.closePath();
            ctx.fillStyle = isDark ? '#1e293b' : 'white';
            ctx.fill();
            ctx.strokeStyle = isDark ? '#334155' : '#e2e2e2';
            ctx.lineWidth = 1 * s;
            ctx.stroke();

            // Title
            ctx.font = titleFont;
            ctx.fillStyle = isDark ? '#94a3b8' : '#666';
            ctx.fillText('Legend', bx + pad, by + pad + 12 * s);

            // Entries
            state.legend.forEach((entry, i) => {
                const ry = by + pad + titleH + i * rowH;
                // Swatch
                const sr = 4 * s;
                const sx = bx + pad;
                const sy = ry + (rowH - swatchSize) / 2;
                ctx.beginPath();
                ctx.moveTo(sx + sr, sy);
                ctx.lineTo(sx + swatchSize - sr, sy);
                ctx.quadraticCurveTo(sx + swatchSize, sy, sx + swatchSize, sy + sr);
                ctx.lineTo(sx + swatchSize, sy + swatchSize - sr);
                ctx.quadraticCurveTo(sx + swatchSize, sy + swatchSize, sx + swatchSize - sr, sy + swatchSize);
                ctx.lineTo(sx + sr, sy + swatchSize);
                ctx.quadraticCurveTo(sx, sy + swatchSize, sx, sy + swatchSize - sr);
                ctx.lineTo(sx, sy + sr);
                ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
                ctx.closePath();
                ctx.fillStyle = entry.color;
                ctx.fill();
                // Label
                ctx.font = font;
                ctx.fillStyle = isDark ? '#e2e8f0' : '#333';
                ctx.fillText(entry.label, bx + pad + swatchSize + gap, ry + rowH / 2 + 5 * s);
            });
        }

        return finalCanvas;
    };
    dom.shareScreenshot.addEventListener('click', async (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        dom.shareBtn.textContent = 'Capturing...';
        try {
            // Safari requires ClipboardItem to receive a Promise<Blob>, and clipboard.write()
            // must be called synchronously within the user gesture (click handler)
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': captureMap().then(c => new Promise(r => c.toBlob(r, 'image/png')))
                })
            ]);
            dom.shareBtn.textContent = 'Copied!';
            setTimeout(() => dom.shareBtn.textContent = 'Share', 2000);
        } catch (err) {
            await showAlert('Screenshot failed: ' + (err?.message || 'could not render the map as an image'));
            dom.shareBtn.textContent = 'Share';
        }
    });
    dom.shareDownload.addEventListener('click', async (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        dom.shareBtn.textContent = 'Capturing...';
        try {
            const canvas = await captureMap();
            const dataUrl = canvas.toDataURL('image/png');
            const link = el('a', null, {
                href: dataUrl,
                download: sanitizeFilename(state.name || 'story-map') + '-' + formatTimestamp() + '.png'
            });
            link.click();
            dom.shareBtn.textContent = 'Share';
        } catch (err) {
            await showAlert('Screenshot failed: ' + (err?.message || 'could not render the map as an image'));
            dom.shareBtn.textContent = 'Share';
        }
    });

    // Undo/Redo buttons
    dom.undoBtn.addEventListener('click', () => { undo(); });
    dom.redoBtn.addEventListener('click', () => { redo(); });

    // Panel tab controls
    dom.legendToggle?.addEventListener('click', () => switchPanelTab('legend'));
    dom.partialsToggle?.addEventListener('click', () => switchPanelTab('partials'));
    dom.notesToggle?.addEventListener('click', () => switchPanelTab('notepad'));
    dom.logToggle?.addEventListener('click', () => switchPanelTab('log'));
    dom.legendAddBtn?.addEventListener('click', () => {
        if (state.legend.length >= Object.keys(CARD_COLORS).length) return;
        pushUndo();
        state.legend.push({
            id: generateId(),
            color: CARD_COLORS.yellow,
            label: ''
        });
        log.logEvent('Added legend entry');
        renderAndSave();
        const inputs = dom.legendEntries.querySelectorAll('.legend-label');
        if (inputs.length) inputs[inputs.length - 1].focus();
    });

    // Search
    dom.searchBtn.addEventListener('click', openSearch);
    dom.searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => applySearchFilter(dom.searchInput.value.trim()), 150);
    });
    dom.searchClose.addEventListener('click', closeSearch);

    // Filter panel
    dom.searchFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFilterPanel();
    });
    dom.filterClearBtn.addEventListener('click', () => {
        clearAllFilters();
        populateFilterPanel();
    });
    dom.filterPanel.addEventListener('click', (e) => e.stopPropagation());
    dom.filterDoneBtn.addEventListener('click', closeFilterPanel);

    // Zoom controls
    dom.zoomIn.addEventListener('click', navigation.zoomIn);
    dom.zoomOut.addEventListener('click', navigation.zoomOut);
    dom.zoomReset.addEventListener('click', navigation.zoomCycle);

    // Main menu dropdown
    dom.menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.shareMenu.classList.remove('visible');
        dom.mainMenu.classList.toggle('visible');
        document.body.classList.toggle('main-menu-open', dom.mainMenu.classList.contains('visible'));
        const onMap = !dom.welcomeScreen.classList.contains('visible');
        dom.copyExistingBtn.disabled = !onMap;
        dom.exportSubmenuTrigger.disabled = !onMap;
        dom.printBtn.disabled = !onMap;
        dom.backupsBtn.disabled = !onMap;
    });

    // Submenu collapse helper
    const collapseSubmenus = (...except) => {
        const all = [
            [dom.samplesSubmenuTrigger, dom.samplesSubmenu],
            [dom.importSubmenuTrigger, dom.importSubmenu],
            [dom.exportSubmenuTrigger, dom.exportSubmenu],
        ];
        all.forEach(([trigger, menu]) => {
            if (except.includes(trigger)) return;
            trigger.classList.remove('expanded');
            menu.classList.remove('visible');
            menu.querySelectorAll('.integration-icon').forEach(i => i.classList.remove('active'));
            menu.querySelectorAll('.integration-options').forEach(o => o.classList.remove('visible'));
        });
    };

    // Samples submenu toggle
    dom.samplesSubmenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseSubmenus(dom.samplesSubmenuTrigger);
        dom.samplesSubmenuTrigger.classList.toggle('expanded');
        dom.samplesSubmenu.classList.toggle('visible');
    });

    // Import submenu toggle
    dom.importSubmenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseSubmenus(dom.importSubmenuTrigger);
        dom.importSubmenuTrigger.classList.toggle('expanded');
        dom.importSubmenu.classList.toggle('visible');
    });

    // Export submenu toggle
    dom.exportSubmenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseSubmenus(dom.exportSubmenuTrigger);
        dom.exportSubmenuTrigger.classList.toggle('expanded');
        dom.exportSubmenu.classList.toggle('visible');
    });

    // Integration icon toggle
    document.querySelectorAll('.integration-icon[data-integration]').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const integration = icon.dataset.integration;
            const container = icon.closest('.dropdown-submenu-content');
            const wasActive = icon.classList.contains('active');
            container.querySelectorAll('.integration-icon').forEach(i => i.classList.remove('active'));
            container.querySelectorAll('.integration-options').forEach(o => o.classList.remove('visible'));
            if (!wasActive) {
                icon.classList.add('active');
                container.querySelector(`.integration-options[data-for="${integration}"]`)?.classList.add('visible');
            }
        });
    });

    // Handle clicks on sample items in main menu
    dom.mainMenu.addEventListener('click', async (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item?.dataset.sample) {
            if (lockState.isLocked && !lockState.sessionUnlocked) {
                await showAlert('This map is read-only. Unlock it first to load a sample.');
                closeMainMenu();
                return;
            }
            loadSample(item.dataset.sample);
            closeMainMenu();
        }
    });

    document.addEventListener('click', () => {
        closeMainMenu();
        closeAllOptionsMenus();
        dom.shareMenu.classList.remove('visible');
        closeFilterPanel();
    });

    document.addEventListener('keydown', (e) => {
        const isTextInput = e.target.matches('input, textarea') || e.target.closest('.cm-editor');

        const isEmptyTextInput = isTextInput && e.target.matches('input, textarea') && !e.target.value;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && (!isTextInput || isEmptyTextInput)) {
            e.preventDefault();
            undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && (!isTextInput || isEmptyTextInput)) {
            e.preventDefault();
            redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !isTextInput && selection.columnIds.length > 0) {
            e.preventDefault();
            duplicateColumns();
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextInput && selection.columnIds.length > 0) {
            e.preventDefault();
            const hasStorySelection = selection.clickedCards.some(c => c.type === 'story');
            if (hasStorySelection) {
                deleteSelectedCards();
            } else {
                deleteSelectedColumns();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            openSearch();
        }
        if (e.key === 'Escape' && fullscreenMode) {
            const now = Date.now();
            if (now - lastFullscreenEsc < 500) {
                exitFullscreenMode();
                lastFullscreenEsc = 0;
                return;
            }
            lastFullscreenEsc = now;
        }
        if (e.key === 'Escape') {
            const hadOpenUI =
                dom.cardExpandModal.classList.contains('visible') ||
                !dom.filterPanel.classList.contains('hidden') ||
                !dom.searchBar.classList.contains('hidden') ||
                selection.columnIds.length > 0 ||
                dom.mainMenu.classList.contains('visible') ||
                dom.shareMenu.classList.contains('visible') ||
                dom.importModal.classList.contains('visible') ||
                dom.exportModal.classList.contains('visible') ||
                dom.backupsModal?.classList.contains('visible');
            if (dom.cardExpandModal.classList.contains('visible')) {
                closeExpandModal();
                return;
            }
            if (!dom.filterPanel.classList.contains('hidden')) {
                closeFilterPanel();
            } else if (!dom.searchBar.classList.contains('hidden')) {
                closeSearch();
            } else if (selection.columnIds.length > 0) {
                clearSelection();
                updateSelectionUI();
            }
            closeMainMenu();
            closeAllOptionsMenus();
            dom.shareMenu.classList.remove('visible');
            hideImportModal();
            hideExportModal();
            hideJiraExportModal();
            hideJiraApiExportModal();
            hidePhabExportModal();
            hideAsanaExportModal();
            hideAsanaCsvExportModal();
            if (fullscreenMode && !hadOpenUI) {
                showToast('Press Esc again to exit full screen mode', 1500);
            }
        }
        if (!isTextInput && ((e.altKey && e.key === 'r') || (e.shiftKey && e.code === 'Digit0'))) {
            e.preventDefault();
            zoomToFit();
        }
        if (!isTextInput && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            const PAN_AMOUNT = 100;
            const wrapper = dom.storyMapWrapper;
            switch (e.key) {
                case 'ArrowLeft':
                    wrapper.scrollBy({ left: -PAN_AMOUNT, behavior: 'smooth' });
                    break;
                case 'ArrowRight':
                    wrapper.scrollBy({ left: PAN_AMOUNT, behavior: 'smooth' });
                    break;
                case 'ArrowUp':
                    wrapper.scrollBy({ top: -PAN_AMOUNT, behavior: 'smooth' });
                    break;
                case 'ArrowDown':
                    wrapper.scrollBy({ top: PAN_AMOUNT, behavior: 'smooth' });
                    break;
            }
            e.preventDefault();
        }
    });

    // Pan/drag navigation (right-click to pan, Miro-style)
    navigation.initPan();

    // Marquee (rectangle) selection
    navigation.initMarquee();

    // Ctrl+scroll wheel zoom
    navigation.initWheelZoom();

    // Pinch-to-zoom on touch devices
    navigation.initPinchZoom();

    // Lock feature event listeners
    initLockListeners();

    // Auto-fit map on window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(navigation.resizeToFit, 200);
    });
};

// =============================================================================
// Welcome Screen / Loading
// =============================================================================

let counterLoaded = false;
let legendAutoOpened = false;
let activeMappersInterval = null;

const setCounterValue = (count) => {
    if (!dom.welcomeCounter) return;
    dom.welcomeCounter.innerHTML = `📊 <span class="count">${count.toLocaleString()}</span> story maps created`;
    dom.welcomeCounter.classList.add('visible');
};

const updateActiveMappers = async () => {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (!counterLoaded) {
            const count = data.mapCount || 0;
            if (count > 0) {
                localStorage.setItem('mapCount', count);
                setCounterValue(count);
            }
            counterLoaded = true;
        }
        if (dom.activeMappers && document.body.classList.contains('welcome-visible')) {
            if (data.activeUsers > 0) {
                dom.activeMappers.textContent = `${data.activeUsers} ${data.activeUsers === 1 ? 'user' : 'users'} mapping now`;
                dom.activeMappers.classList.add('visible');
            } else {
                dom.activeMappers.classList.remove('visible');
            }
        }
    } catch {
        // Silently fail - counter is non-essential
    }
};

const subscribeToCounter = async () => {
    if (!dom.welcomeCounter || counterLoaded) return;

    const cached = localStorage.getItem('mapCount');
    if (cached) {
        setCounterValue(parseInt(cached));
    }

    await updateActiveMappers();
    activeMappersInterval = setInterval(updateActiveMappers, 5_000);
};

const unsubscribeFromCounter = () => {
    counterLoaded = false;
    dom.welcomeCounter?.classList.remove('visible');
    dom.activeMappers?.classList.remove('visible');
    if (activeMappersInterval) {
        clearInterval(activeMappersInterval);
        activeMappersInterval = null;
    }
};

const incrementMapCounter = async () => {
    try {
        const res = await fetch('/api/stats', { method: 'POST' });
        const data = await res.json();
        localStorage.setItem('mapCount', data.mapCount);
    } catch {
        // Silently fail - counter is non-essential
    }
};

// Unified panel tab switching
const switchPanelTab = (sectionKey) => {
    const sections = dom.panelBody?.querySelectorAll('.panel-section');
    const tabs = document.querySelectorAll('.panel-tab');
    const activeSection = dom.panelBody?.querySelector(`.panel-section[data-section="${sectionKey}"]`);
    const activeTab = document.querySelector(`.panel-tab[data-section="${sectionKey}"]`);

    if (!activeSection || !activeTab || activeTab.disabled) return;

    const isAlreadyOpen = activeSection.classList.contains('open');

    // Close all sections and deactivate all tabs
    sections?.forEach(s => s.classList.remove('open'));
    tabs.forEach(t => t.classList.remove('active'));

    if (isAlreadyOpen) {
        // Close the panel entirely
        dom.controlsRight?.classList.remove('panel-open');
    } else {
        // Open the requested section
        activeSection.classList.add('open');
        activeTab.classList.add('active');
        dom.controlsRight?.classList.add('panel-open');
        if (sectionKey === 'notepad') notepad.ensureEditor();
    }
};

const showWelcomeScreen = () => {
    document.body.classList.add('welcome-visible');
    dom.welcomeScreen.classList.add('visible');
    dom.storyMapWrapper.classList.remove('visible');
    dom.boardName.classList.add('hidden');
    dom.zoomControls.classList.add('hidden');
    dom.controlsRight?.classList.add('hidden');
    dom.controlsRight?.classList.remove('panel-open');
    dom.panelBody?.querySelectorAll('.panel-section').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    dom.searchBtn.disabled = true;
    closeSearch();
    clearPresence();
    clearCursors();
    clearLockSubscription();
    updateLockUI();
    subscribeToCounter();
};

const hideWelcomeScreen = () => {
    document.body.classList.remove('welcome-visible');
    dom.welcomeScreen.classList.remove('visible');
    dom.storyMapWrapper.classList.add('visible');
    dom.boardName.classList.remove('hidden');
    dom.zoomControls.classList.remove('hidden');
    dom.controlsRight?.classList.remove('hidden');
    dom.searchBtn.disabled = false;
    unsubscribeFromCounter();
    if (!legendAutoOpened && window.matchMedia('(pointer: fine)').matches) {
        switchPanelTab('legend');
        legendAutoOpened = true;
    }
};

const showLoading = () => {
    dom.loadingIndicator.classList.add('visible');
};

const hideLoading = () => {
    dom.loadingIndicator.classList.remove('visible');
};

const startNewMap = async () => {
    hideWelcomeScreen();
    initState();
    const mapId = await newMapId();
    state.mapId = mapId;
    history.replaceState({ mapId }, '', `/${mapId}`);
    dom.boardName.value = state.name;
    render();
    requestAnimationFrame(zoomToFit);
    setTimeout(showTutorialToast, 800);
    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

const showTutorialToast = () => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
    const shortcutEl = dom.tutorialToast.querySelector('.reset-shortcut-key');
    if (isMac && shortcutEl) shortcutEl.textContent = 'Shift + 0';
    dom.tutorialToast.classList.add('visible');
    const dismiss = () => {
        dom.tutorialToast.classList.remove('visible');
        clearTimeout(timer);
    };
    const timer = setTimeout(dismiss, 5000);
    dom.tutorialToastClose.addEventListener('click', dismiss, { once: true });
};

const startWithSample = async (sampleName, { showToast = true } = {}) => {
    hideWelcomeScreen();
    initState();
    const mapId = await newMapId();
    state.mapId = mapId;
    history.replaceState({ mapId }, '', `/${mapId}`);

    try {
        const response = await fetch(`samples/${sampleName}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error();
        deserialize(await response.json());
    } catch {
        await showAlert('Failed to load sample');
    }
    dom.boardName.value = state.name;
    render();
    requestAnimationFrame(zoomToFit);
    if (showToast) setTimeout(showTutorialToast, 800);

    await createYjsDoc(mapId);
    subscribeToMap(mapId);
    saveToStorage();
    incrementMapCounter();
};

// =============================================================================
// Module Wiring
// =============================================================================

// Wire state module (needs serialize/deserialize + renderAndSave)
stateInit({ dom, serialize, deserialize, renderAndSave, logEvent: (text, ids) => log.logEvent(text, ids) });

// Wire navigation module
navigation.init({ dom, state, updateSelectionUI, selection, clearSelection, isMapEditable, addColumnAt, deleteColumn, duplicateColumns, duplicateCards, deleteSelectedColumns, deleteSelectedCards, insertPartialMapRef: (...args) => insertPartialMapRef(...args) });

// Wire presence module
presence.init({
    getProvider,
    getYdoc,
    dom,
    getZoomLevel: () => navigation.zoomLevel,
    getState: () => state,
});

// Wire lock module
lock.init({
    state,
    dom,
    getProvider,
    getYdoc,
    getCursorColor,
    render,
    notepadUpdate: () => notepad.update(),
    saveToStorage,
    closeMainMenu,
    initSortable,
    renderLegend,
    logEvent: (text, ids) => log.logEvent(text, ids),
});

// Wire yjs module
yjs.init({
    state,
    notepad,
    log,
    dom,
    isMapEditable,
    render,
});

// Wire tour module
tour.init({
    addSlice,
    deleteSlice,
    getState: () => state,
    renderAndSave,
    createStory,
    zoomToFit,
});

// Materialize phantom columns up to and including the given index (0-based).
// Columns before the target are created hidden (spacers); the target column is visible.
const materializePhantomColumn = (phantomIndex = 0) => {
    pushUndo();
    let targetColumn = null;
    for (let i = 0; i <= phantomIndex; i++) {
        const hidden = i < phantomIndex;
        const column = createColumn('', CARD_COLORS.green, null, hidden);
        state.columns.push(column);
        state.users[column.id] = [];
        state.activities[column.id] = [];
        state.slices.forEach(slice => slice.stories[column.id] = []);
        if (!hidden) targetColumn = column;
    }
    renderAndSave();
    return targetColumn;
};

// =============================================================================
// Partial Map Operations
// =============================================================================

const createPartialMap = (name, columnIds) => {
    pushUndo();

    const selectedCols = state.columns.filter(c => columnIds.includes(c.id));
    if (selectedCols.length === 0) return;

    const pmId = generateId();

    // Deep-copy columns into partial definition
    const pmColumns = selectedCols.map(c => ({
        ...c,
        id: c.id,
        tags: [...(c.tags || [])]
    }));

    // Move stories from slices into the partial
    const pmStories = {};
    state.slices.forEach(slice => {
        pmStories[slice.id] = {};
        selectedCols.forEach(col => {
            pmStories[slice.id][col.id] = (slice.stories[col.id] || []).map(s => ({
                ...s,
                tags: [...(s.tags || [])]
            }));
            delete slice.stories[col.id];
        });
    });

    // Move users/activities into the partial
    const pmUsers = {};
    const pmActivities = {};
    selectedCols.forEach(col => {
        pmUsers[col.id] = (state.users[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
        pmActivities[col.id] = (state.activities[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
        delete state.users[col.id];
        delete state.activities[col.id];
    });

    state.partialMaps.push({
        id: pmId,
        name,
        columns: pmColumns,
        users: pmUsers,
        activities: pmActivities,
        stories: pmStories
    });

    // Replace selected columns with a single reference column at the first selected position
    const firstIdx = state.columns.findIndex(c => c.id === selectedCols[0].id);
    const refCol = createRefColumn(pmId, true);

    state.columns = state.columns.filter(c => !columnIds.includes(c.id));
    state.columns.splice(firstIdx, 0, refCol);

    // Add empty story arrays for the ref column
    state.users[refCol.id] = [];
    state.activities[refCol.id] = [];
    state.slices.forEach(slice => {
        slice.stories[refCol.id] = [];
    });

    clearSelection();
    renderAndSave();

    switchPanelTab('partials');
};

const isColumnEmpty = (col) => {
    if (col.name && col.name.trim() !== '') return false;
    if ((state.users[col.id] || []).length > 0) return false;
    if ((state.activities[col.id] || []).length > 0) return false;
    return !state.slices.some(s => (s.stories[col.id] || []).length > 0);
};

const ensurePartialBlankCol = () => {
    const pmId = partialMapEditState.activeId;
    if (!pmId) return;
    const refCol = state.columns.find(c => c.partialMapId === pmId && c._editingHidden);
    if (!refCol) return;
    const refIdx = state.columns.indexOf(refCol);

    // Find end of partial's editing range using tracked IDs
    let endIdx = refIdx + 1;
    while (endIdx < state.columns.length && partialMapEditState.editingColIds.has(state.columns[endIdx].id)) {
        endIdx++;
    }

    // Check if the last column in range is already an empty blank
    if (endIdx > refIdx + 1) {
        const lastCol = state.columns[endIdx - 1];
        if (lastCol._partialBlank && isColumnEmpty(lastCol)) return;
    }

    // Add a new blank column at endIdx
    const blankCol = createColumn('', null, null, false);
    blankCol._partialBlank = true;
    state.columns.splice(endIdx, 0, blankCol);
    state.users[blankCol.id] = [];
    state.activities[blankCol.id] = [];
    state.slices.forEach(slice => { slice.stories[blankCol.id] = []; });
    partialMapEditState.editingColIds.add(blankCol.id);
};

const startEditingPartial = (partialMapId) => {
    const pm = state.partialMaps.find(p => p.id === partialMapId);
    if (!pm) return;

    partialMapEditState.expandedIds.clear();
    pushUndo();

    const refCol = state.columns.find(c => c.partialMapId === partialMapId && c.partialMapOrigin)
        || state.columns.find(c => c.partialMapId === partialMapId);
    if (!refCol) return;

    const refIdx = state.columns.indexOf(refCol);

    // Mark ref column as hidden during editing
    refCol._editingHidden = true;

    // Splice partial's columns into state.columns after the ref
    state.columns.splice(refIdx + 1, 0, ...pm.columns);

    // Inject partial's stories into slices
    state.slices.forEach(slice => {
        const pmSliceStories = pm.stories[slice.id] || {};
        pm.columns.forEach(col => {
            slice.stories[col.id] = pmSliceStories[col.id] || [];
        });
    });

    // Inject partial's users/activities into state
    pm.columns.forEach(col => {
        state.users[col.id] = (pm.users?.[col.id] || []);
        state.activities[col.id] = (pm.activities?.[col.id] || []);
    });

    partialMapEditState.activeId = partialMapId;
    partialMapEditState.editingColIds = new Set(pm.columns.map(c => c.id));

    // Add blank column at the right edge for adding new steps
    ensurePartialBlankCol();

    renderAndSave();

    requestAnimationFrame(() => {
        if (pm.columns.length > 0) {
            const firstCol = dom.storyMap.querySelector(`.step[data-column-id="${pm.columns[0].id}"]`);
            if (firstCol) scrollElementIntoView(firstCol);
        }
    });
};

const stopEditingPartial = () => {
    const pmId = partialMapEditState.activeId;
    if (!pmId) return;

    const pm = state.partialMaps.find(p => p.id === pmId);
    if (!pm) return;

    pushUndo();

    // Find the hidden ref column
    const refCol = state.columns.find(c => c.partialMapId === pmId && c._editingHidden);

    // Gather editing columns in state.columns order using tracked IDs
    const allRangeColIds = new Set(partialMapEditState.editingColIds);
    const editedColumns = state.columns.filter(c => allRangeColIds.has(c.id));

    // Prune trailing empty columns (blank columns the user didn't fill)
    while (editedColumns.length > 0 && isColumnEmpty(editedColumns[editedColumns.length - 1])) {
        editedColumns.pop();
    }

    // Update partial columns from the kept edited columns
    pm.columns = editedColumns.map(c => {
        const { _partialBlank, ...rest } = c;
        return { ...rest, tags: [...(c.tags || [])] };
    });

    // Update partial stories from slices
    pm.stories = {};
    state.slices.forEach(slice => {
        pm.stories[slice.id] = {};
        pm.columns.forEach(col => {
            pm.stories[slice.id][col.id] = (slice.stories[col.id] || []).map(s => ({
                ...s,
                tags: [...(s.tags || [])]
            }));
        });
        // Clean up all range columns from slice stories
        for (const colId of allRangeColIds) {
            delete slice.stories[colId];
        }
    });

    // Update partial users/activities from state
    pm.users = {};
    pm.activities = {};
    pm.columns.forEach(col => {
        pm.users[col.id] = (state.users[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
        pm.activities[col.id] = (state.activities[col.id] || []).map(s => ({ ...s, tags: [...(s.tags || [])] }));
    });
    // Clean up all range columns from state users/activities
    for (const colId of allRangeColIds) {
        delete state.users[colId];
        delete state.activities[colId];
    }

    // Remove all range columns from state.columns
    state.columns = state.columns.filter(c => !allRangeColIds.has(c.id));

    // Unhide the ref column
    if (refCol) delete refCol._editingHidden;

    partialMapEditState.activeId = null;
    partialMapEditState.editingColIds.clear();
    renderAndSave();
};

const deletePartialMap = (partialMapId) => {
    pushUndo();

    // Remove all reference columns pointing to this partial
    state.columns = state.columns.filter(c => c.partialMapId !== partialMapId);

    // Clean up stories/users/activities for removed ref columns
    const colIds = new Set(state.columns.map(c => c.id));
    state.slices.forEach(slice => {
        for (const colId of Object.keys(slice.stories)) {
            if (!colIds.has(colId)) delete slice.stories[colId];
        }
    });
    for (const colId of Object.keys(state.users)) {
        if (!colIds.has(colId)) delete state.users[colId];
    }
    for (const colId of Object.keys(state.activities)) {
        if (!colIds.has(colId)) delete state.activities[colId];
    }

    state.partialMaps = state.partialMaps.filter(p => p.id !== partialMapId);

    if (partialMapEditState.activeId === partialMapId) {
        partialMapEditState.activeId = null;
    }

    // Ensure at least one column remains
    if (state.columns.length === 0) {
        const col = createColumn('New Step', CARD_COLORS.green, null, false);
        state.columns.push(col);
        state.users[col.id] = [];
        state.activities[col.id] = [];
        state.slices.forEach(slice => slice.stories[col.id] = []);
    }

    renderAndSave();
};

const restorePartialMap = (partialMapId) => {
    const pm = state.partialMaps.find(p => p.id === partialMapId);
    if (!pm) return;

    pushUndo();

    // Find the first ref column for this partial (prefer origin)
    const refCol = state.columns.find(c => c.partialMapId === partialMapId && c.partialMapOrigin)
        || state.columns.find(c => c.partialMapId === partialMapId);
    const insertIdx = refCol ? state.columns.indexOf(refCol) : state.columns.length;

    // Count ref columns before the insert point (to adjust index after removal)
    const refsBefore = state.columns.filter((c, i) => c.partialMapId === partialMapId && i < insertIdx).length;

    // Remove ALL ref columns for this partial and clean up their data
    const refColIds = state.columns.filter(c => c.partialMapId === partialMapId).map(c => c.id);
    state.columns = state.columns.filter(c => c.partialMapId !== partialMapId);
    refColIds.forEach(colId => {
        delete state.users[colId];
        delete state.activities[colId];
    });
    state.slices.forEach(slice => {
        refColIds.forEach(colId => { delete slice.stories[colId]; });
    });

    const adjustedIdx = Math.min(insertIdx - refsBefore, state.columns.length);

    // Splice partial's columns back into state.columns
    state.columns.splice(adjustedIdx, 0, ...pm.columns);

    // Restore stories into slices
    state.slices.forEach(slice => {
        const pmSliceStories = pm.stories[slice.id] || {};
        pm.columns.forEach(col => {
            slice.stories[col.id] = pmSliceStories[col.id] || [];
        });
    });

    // Restore users/activities
    pm.columns.forEach(col => {
        state.users[col.id] = pm.users?.[col.id] || [];
        state.activities[col.id] = pm.activities?.[col.id] || [];
    });

    // Remove the partial definition
    state.partialMaps = state.partialMaps.filter(p => p.id !== partialMapId);

    if (partialMapEditState.activeId === partialMapId) {
        partialMapEditState.activeId = null;
    }

    renderAndSave();
};

const replaceWithPartial = (partialMapId, columnIds) => {
    pushUndo();

    const selectedCols = state.columns.filter(c => columnIds.includes(c.id));
    if (selectedCols.length === 0) return;

    const firstIdx = state.columns.findIndex(c => c.id === selectedCols[0].id);

    // Delete selected columns and their data
    state.columns = state.columns.filter(c => !columnIds.includes(c.id));
    columnIds.forEach(colId => {
        delete state.users[colId];
        delete state.activities[colId];
    });
    state.slices.forEach(slice => {
        columnIds.forEach(colId => {
            delete slice.stories[colId];
        });
    });

    // Insert ref column at the first selected position
    const refCol = createRefColumn(partialMapId, false);
    state.columns.splice(firstIdx, 0, refCol);
    state.users[refCol.id] = [];
    state.activities[refCol.id] = [];
    state.slices.forEach(slice => {
        slice.stories[refCol.id] = [];
    });

    clearSelection();
    renderAndSave();
    switchPanelTab('partials');
};

const insertPartialMapRef = (partialMapId, afterColumnIndex) => {
    pushUndo();
    const refCol = createRefColumn(partialMapId, false);
    state.columns.splice(afterColumnIndex + 1, 0, refCol);
    state.users[refCol.id] = [];
    state.activities[refCol.id] = [];
    state.slices.forEach(slice => {
        slice.stories[refCol.id] = [];
    });
    renderAndSave();
};

// Wire ui module
ui.init({
    state,
    dom,
    isMapEditable,
    pushUndo,
    addStory,
    deleteColumn,
    deleteStory,
    deleteSlice,
    saveToStorage,
    renderAndSave,
    scrollElementIntoView,
    addColumn,
    addSlice,
    materializePhantomColumn,
    handleColumnSelection,
    startEditingPartial,
    stopEditingPartial,
    deletePartialMap,
    restorePartialMap,
    openExpandModal,
    logEvent: (text, ids) => log.logEvent(text, ids),
    logTextEdit: (label, id) => log.logTextEdit(label, id),
});

// Wire render module
renderMod.init({
    state,
    dom,
    isMapEditable,
    pushUndo,
    saveToStorage,
    renderAndSave,
    ensureSortable,
    scrollElementIntoView,
    notepadUpdate: () => notepad.update(),
    getIsSafari: () => isSafari,
    getZoomLevel: () => navigation.zoomLevel,
    broadcastDragStart,
    broadcastDragEnd,
    getIsPinching: () => navigation.isPinching,
    createPartialMap,
    deletePartialMap,
    replaceWithPartial,
    logEvent: (text, ids) => log.logEvent(text, ids),
    logTextEdit: (label, id) => log.logTextEdit(label, id),
});

// =============================================================================
// Initialize
// =============================================================================

const loadMapById = async (mapId) => {
    destroyYjs();

    if (mapId) {
        state.mapId = mapId;
        await createYjsDoc(mapId);
        await subscribeToMap(mapId);

        // Data arrived via Yjs sync
        if (state.columns.length > 0) {
            return true;
        }

        // Yjs doc may still be loading from server persistence — wait briefly
        const ymap = getYmap();
        if (ymap) {
            const hasData = await new Promise(resolve => {
                let resolved = false;
                const done = (result) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    ymap.unobserveDeep(check);
                    resolve(result);
                };
                const timeout = setTimeout(() => done(false), 500);
                const check = () => {
                    syncFromYjs();
                    if (state.columns.length > 0) {
                        render();
                        done(true);
                    }
                };
                ymap.observeDeep(check);
            });
            if (hasData) return true;
        }

        // Fallback: load from localStorage if Yjs sync failed
        // Only skip if a *different* mapId is stored (null = no tracking yet, allow it)
        const storedMapId = localStorage.getItem(STORAGE_KEY + ':mapId');
        if ((!storedMapId || storedMapId === mapId) && loadFromStorage()) {
            dom.boardName.value = state.name;
            render();
            saveToStorage();
            return true;
        }
    }
    return false;
};

const init = async () => {
    const mapId = window.location.pathname.slice(1) || null;

    initEventListeners();
    notepad.init({ state, saveToStorage, isMapEditable, logTextEdit: (label, id) => log.logTextEdit(label, id) });
    log.init();
    updateCursorsVisibilityUI();

    // Populate browser-specific DevTools instructions
    const devtoolsHint = isSafari
        ? 'first enable via Safari &gt; Settings &gt; Advanced &gt; <em>Show features for web developers</em>, then press <strong>Cmd+Option+I</strong>'
        : /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
            ? 'press <strong>Cmd+Option+I</strong>'
            : 'press <strong>F12</strong>';
    document.querySelectorAll('.devtools-instructions').forEach(el => {
        el.innerHTML = devtoolsHint;
    });

    if (mapId === 'new') {
        await startNewMap();
    } else if (mapId) {
        loadYjs(); // Start downloading Yjs modules in parallel with DOM setup
        showLoading();
        const loaded = await loadMapById(mapId);
        hideLoading();
        if (loaded) {
            hideWelcomeScreen();
            requestAnimationFrame(zoomToFit);
            setTimeout(showTutorialToast, 800);
        } else {
            showWelcomeScreen();
        }
    } else {
        showWelcomeScreen();
    }
};

init();
