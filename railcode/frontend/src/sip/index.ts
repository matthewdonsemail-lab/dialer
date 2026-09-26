export { getSipConfig, isSipConfigured, getSipDomain, getSipExtension, SIP_PRESETS } from "./config.js";
export type { SipConfig, SipPreset } from "./config.js";
export { sipLog, classifyFailure, getReport } from "./diagnostics.js";
export type { SipEvent, SipEventLevel, ClassifiedFailure, SipFailureKind, SipReport } from "./diagnostics.js";
