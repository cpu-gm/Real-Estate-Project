import {
  DealState,
  DealStates,
  EventType,
  EventTypes,
  StressMode,
  StressModes
} from "@kernel/shared";

export type ProjectionEvent = {
  id: string;
  type: string;
  createdAt: Date;
};

type ProjectionInput = {
  initialDeal: {
    state: DealState;
    stressMode: StressMode;
  };
  events: ProjectionEvent[];
};

function isEventType(type: string): type is EventType {
  return Object.values(EventTypes).includes(type as EventType);
}

export function projectDealLifecycle(input: ProjectionInput): {
  state: DealState;
  stressMode: StressMode;
} {
  let state = input.initialDeal.state;
  let lastNonFrozenState: DealState = state;

  let dataDisputed = false;
  let distressActive = false;

  const setState = (nextState: DealState) => {
    state = nextState;
  };

  for (const event of input.events) {
    if (!isEventType(event.type)) {
      continue;
    }

    if (event.type === EventTypes.DataDisputed) {
      dataDisputed = true;
    }
    if (event.type === EventTypes.DistressDeclared) {
      distressActive = true;
    }
    if (event.type === EventTypes.DistressResolved) {
      distressActive = false;
    }

    if (event.type === EventTypes.DealTerminated) {
      setState(DealStates.Terminated);
    } else if (event.type === EventTypes.ExitFinalized) {
      if (state !== DealStates.Terminated) {
        setState(DealStates.Exited);
      }
    } else if (state !== DealStates.Exited && state !== DealStates.Terminated) {
      switch (event.type) {
        case EventTypes.ReviewOpened:
          if (state === DealStates.Draft) {
            setState(DealStates.UnderReview);
          }
          break;
        case EventTypes.DealApproved:
          if (state === DealStates.UnderReview) {
            setState(DealStates.Approved);
          }
          break;
        case EventTypes.ClosingReadinessAttested:
          if (state === DealStates.Approved) {
            setState(DealStates.ReadyToClose);
          }
          break;
        case EventTypes.ClosingFinalized:
          if (state === DealStates.ReadyToClose) {
            setState(DealStates.Closed);
          }
          break;
        case EventTypes.OperationsActivated:
          if (state === DealStates.Closed || state === DealStates.Resolved) {
            setState(DealStates.Operating);
          }
          break;
        case EventTypes.MaterialChangeDetected:
          if (state === DealStates.Operating) {
            setState(DealStates.Changed);
          }
          break;
        case EventTypes.ChangeReconciled:
          if (state === DealStates.Changed) {
            setState(DealStates.Operating);
          }
          break;
        case EventTypes.DistressDeclared:
          if (state === DealStates.Operating || state === DealStates.Changed) {
            setState(DealStates.Distressed);
          }
          break;
        case EventTypes.DistressResolved:
          if (state === DealStates.Distressed) {
            setState(DealStates.Resolved);
          }
          break;
        case EventTypes.FreezeImposed:
          state = DealStates.Frozen;
          break;
        case EventTypes.FreezeLifted:
          if (state === DealStates.Frozen) {
            setState(lastNonFrozenState);
          }
          break;
        default:
          break;
      }
    }

    if (state !== DealStates.Frozen) {
      lastNonFrozenState = state;
    }
  }

  let stressMode = StressModes.SM0;
  if (dataDisputed) {
    stressMode = StressModes.SM1;
  }
  if (distressActive) {
    stressMode = StressModes.SM2;
  }
  if (state === DealStates.Frozen) {
    stressMode = StressModes.SM3;
  }

  return { state, stressMode };
}
