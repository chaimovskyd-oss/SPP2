# Batch Operations

Batch operations run long tasks with progress, cancellation, and per-item
errors. UI should consume `BatchJob` state and avoid blocking modals.
