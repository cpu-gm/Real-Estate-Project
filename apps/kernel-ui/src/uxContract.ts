import { AllowedEventTypes } from "@kernel/shared";

export const ALLOWED_ACTIONS = AllowedEventTypes.reduce<Record<string, string>>(
  (acc, eventType) => {
    acc[eventType] = eventType;
    return acc;
  },
  {}
);

export const FORBIDDEN_WORDS = ["infer", "derive", "simulate"];