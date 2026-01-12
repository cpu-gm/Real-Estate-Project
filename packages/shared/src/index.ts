export const KERNEL_VERSION = "0.1";

export type TruthIndicator = "DOC" | "HUMAN" | "AI";

export const DealStates = {
  Draft: "Draft",
  UnderReview: "UnderReview",
  Approved: "Approved",
  ReadyToClose: "ReadyToClose",
  Closed: "Closed",
  Operating: "Operating",
  Changed: "Changed",
  Distressed: "Distressed",
  Resolved: "Resolved",
  Frozen: "Frozen",
  Exited: "Exited",
  Terminated: "Terminated"
} as const;

export type DealState = (typeof DealStates)[keyof typeof DealStates];

export const StressModes = {
  SM0: "SM-0",
  SM1: "SM-1",
  SM2: "SM-2",
  SM3: "SM-3"
} as const;

export type StressMode = (typeof StressModes)[keyof typeof StressModes];

export const EventTypes = {
  ReviewOpened: "ReviewOpened",
  DealApproved: "DealApproved",
  ClosingReadinessAttested: "ClosingReadinessAttested",
  ClosingFinalized: "ClosingFinalized",
  OperationsActivated: "OperationsActivated",
  MaterialChangeDetected: "MaterialChangeDetected",
  ChangeReconciled: "ChangeReconciled",
  DistressDeclared: "DistressDeclared",
  DistressResolved: "DistressResolved",
  FreezeImposed: "FreezeImposed",
  FreezeLifted: "FreezeLifted",
  ExitFinalized: "ExitFinalized",
  DealTerminated: "DealTerminated",
  DataDisputed: "DataDisputed",
  ApprovalGranted: "ApprovalGranted",
  ApprovalDenied: "ApprovalDenied",
  OverrideAttested: "OverrideAttested"
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const AllowedEventTypes = [
  "ReviewOpened",
  "DealApproved",
  "ClosingReadinessAttested",
  "ClosingFinalized",
  "OperationsActivated",
  "MaterialChangeDetected",
  "ChangeReconciled",
  "DistressDeclared",
  "DistressResolved",
  "FreezeImposed",
  "FreezeLifted",
  "ExitFinalized",
  "DealTerminated",
  "DataDisputed",
  "ApprovalGranted",
  "ApprovalDenied",
  "OverrideAttested"
] as const;

export type AllowedEventType = (typeof AllowedEventTypes)[number];
