---
name: amazon-devices-vega-best-practices
applies_to: [vega_setup_check, vega_qa_loop]
---

# Vega Best Practices

Read the existing Vega manifest and package boundaries before editing. Prefer Vega-supported primitives in Vega-only code. Keep shared UI free of imports rejected by the setup check. Build before launching VDA, capture the exact failed command, and retry only after the reported defect is addressed.
