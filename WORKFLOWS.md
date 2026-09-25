# Workflows

A workflow is a reviewed, versioned sequence with explicit inputs,
preconditions, capability requirements, approval boundaries, and evidence.

A role description is not a workflow. A catalog entry is not execution
evidence. Workflows become reusable only after measured successful runs and
human approval where required.

Use workflows for recurring repository audits, cached intelligence refreshes,
and bounded handoffs. Keep provider-specific calls behind reviewed adapters.
See [examples/workflow-compile.md](examples/workflow-compile.md).
