// Feedback domain: how every action tells the person what happened.
//   utils/describe-error   any failure as one actionable sentence
//   lib/use-feedback       done / failed / blocked / info toasts, one wording
//   lib/feedback-bus       toasts from outside React (the query client)
//   components/feedback-bridge  the global net for unhandled API failures
// The map of every action and its feedback is docs/feedback-map.md.
export { describeError, type ErrorDescription } from "./utils/describe-error";
export { useFeedback } from "./lib/use-feedback";
export { notify } from "./lib/feedback-bus";
export { FeedbackBridge } from "./components/feedback-bridge";
