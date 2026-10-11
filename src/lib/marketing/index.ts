import "server-only";

// The marketing suite for other parts of the app (Rex, Peggy, the Start-here checklist). Every function is
// scoped to one store id; callers resolve the store from the signed-in seller, never from model input.
// Nothing here sends a message on its own except sendCampaign (and active automations, via their triggers),
// so callers must confirm with the seller before calling sendCampaign or turning an automation on.

export { MarketingError, createSegment, updateSegment, deleteSegment, listSegments, previewSegment } from "./segments";
export {
  createCampaign,
  updateCampaign,
  scheduleCampaign,
  unscheduleCampaign,
  sendCampaign,
  audienceSize,
  campaignAudienceSize,
  previewCampaignHtml,
  testSendCampaign,
} from "./campaigns";
export { createAutomation, updateAutomation, setAutomationActive, deleteAutomation, listAutomations } from "./automations";
export { listTemplates, saveTemplate, copyLibraryTemplate, deleteTemplate } from "./templates";
export { addSubscriber, unsubscribe } from "./subscribers";
export { channelStatus } from "./channels";
export { FLOW_PRESETS, TRIGGER_INFO } from "./flows";
export { describeRules, normalizeRules, SEGMENT_FIELDS, type SegmentRules, type SegmentCondition } from "./segment-rules";
