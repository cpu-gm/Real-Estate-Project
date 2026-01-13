import type { ExplainBlock } from "@/types";

export function ExplainBlockView({ block }: { block: ExplainBlock }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-900">ExplainBlock</h3>
        <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-medium text-amber-900">
          {block.status}
        </span>
      </div>
      <div className="mt-3 text-sm text-amber-900">
        <div>
          <span className="font-semibold">Action:</span> {block.action}
        </div>
      </div>
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Reasons</h4>
        <div className="mt-2 space-y-2 text-sm text-amber-900">
          {block.reasons.map((reason, index) => (
            <div key={`${reason.type}-${index}`} className="rounded-md border border-amber-100 bg-white p-3">
              <div>
                <span className="font-semibold">type:</span> {reason.type}
              </div>
              <div>
                <span className="font-semibold">message:</span> {reason.message}
              </div>
              {reason.materialType && (
                <div>
                  <span className="font-semibold">materialType:</span> {reason.materialType}
                </div>
              )}
              {reason.requiredTruth && (
                <div>
                  <span className="font-semibold">requiredTruth:</span> {reason.requiredTruth}
                </div>
              )}
              {reason.currentTruth !== undefined && (
                <div>
                  <span className="font-semibold">currentTruth:</span> {String(reason.currentTruth)}
                </div>
              )}
              {reason.satisfiedByOverride !== undefined && (
                <div>
                  <span className="font-semibold">satisfiedByOverride:</span>{" "}
                  {String(reason.satisfiedByOverride)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Next Steps</h4>
        <div className="mt-2 space-y-2 text-sm text-amber-900">
          {block.nextSteps.map((step, index) => (
            <div key={`${step.description}-${index}`} className="rounded-md border border-amber-100 bg-white p-3">
              <div>
                <span className="font-semibold">description:</span> {step.description}
              </div>
              <div>
                <span className="font-semibold">canBeFixedByRoles:</span>{" "}
                {step.canBeFixedByRoles.join(", ")}
              </div>
              <div>
                <span className="font-semibold">canBeOverriddenByRoles:</span>{" "}
                {step.canBeOverriddenByRoles.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}